import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import cors from "cors";
import crypto from "crypto";
import stream from "stream";
import ffmpeg from "fluent-ffmpeg";
import { Server } from "socket.io";
import ytdl from "ytdl-core";
import { config } from "dotenv";

import { IRequestLinkEventData } from "./interfaces/Request";
import { main } from "./db";
import userModel from "./db/users";
import { exit } from "process";

// Initialize local directory for downloading
let baseDownloadPath = "";
if (os.platform() === "linux") {
  const tempDir = fs.existsSync(path.posix.resolve(".", "temp"));
  if (!tempDir) {
    fs.mkdirSync(path.posix.resolve(".", "temp"));
  }
  baseDownloadPath = path.posix.resolve(".", "temp");
} else if (os.platform() === "win32") {
  const tempDir = fs.existsSync(path.win32.resolve(".", "temp"));
  if (!tempDir) {
    fs.mkdirSync(path.win32.resolve(".", "temp"));
  }
  baseDownloadPath = path.win32.resolve(".", "temp");
}
config({
  path: path.resolve(__dirname, "..", ".env"),
});
const PORT = process.env.PORT;

(async () => {
  const dbConn = await main();
  if (dbConn === undefined) {
    console.error("Cannot connect to database. Exiting...");
    exit();
  }
  const app = express();

  app.use(express());
  app.use(cors());

  app.get("/", (req: Request, res: Response) => {
    res.json({
      message: "awii",
    });
  });

  app.get("/download/:code", (req: Request, res: Response) => {
    const { code } = req.params;
    if (!code) {
      return res.status(404).send("No relevant code");
    }
    try {
      if (
        fs.existsSync(path.resolve(baseDownloadPath, `${code}.mp3`)) &&
        downloadFileNameMap.has(code)
      ) {
        const filenameSent = downloadFileNameMap.get(code) || "(unset)";
        return res.download(
          path.resolve(baseDownloadPath, `${code}.mp3`),
          `${filenameSent}.mp3`
        );
      } else {
        return res.status(404).send("Resource not found");
      }
    } catch (error) {
      return res.status(500).send("Internal Server Error");
    }
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    path: "/ws",
    cors: {
      origin: "*",
    },
  });

  const socketIdMap = new Map<string, string>();
  const downloadFileNameMap = new Map<string, string>();

  io.of("/ytdl").on("connection", async (socket) => {
    // handle user initialization
    console.log(`IP address: ${socket.request.socket.remoteAddress}`);
    console.log("Client Request Headers");
    console.log(socket.request.headers);
    const clientIp = (socket.request.headers["x-real-ip"] as string) || "";
    if (socket.handshake.headers.clientid !== "") {
      const clientId = socket.handshake.headers.clientid as string;
      console.log(
        "A non-new user connected with id " + socket.handshake.headers.clientid
      );
      await userModel.findOneAndUpdate(
        {
          ipAddress: clientIp,
        },
        {
          $setOnInsert: {
            userId: clientId,
            ipAddress: clientIp,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );
      socketIdMap.set(socket.id, socket.handshake.headers.clientid as string);
      // load the history then send to user
    } else {
      const id = crypto.randomBytes(32).toString("hex");
      console.log("A new user connected. Giving id " + id);
      socket.emit("handshake_id", {
        clientId: id,
      });
      // investigate behavior further. also handle search id first
      await userModel.findOneAndUpdate(
        {
          ipAddress: clientIp,
        },
        {
          $setOnInsert: {
            userId: id,
            ipAddress: clientIp,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );
      socketIdMap.set(socket.id, id);
    }

    // handle request for download
    socket.on("request_link", async (data: IRequestLinkEventData) => {
      console.log(data);
      if (!data.link && ytdl.validateURL(data.link))
        return socket.emit("request_link_rejected", {
          message: "Invalid link",
        });
      const info = await ytdl.getInfo(data.link);
      if (
        !info.formats.some((frmt) => frmt.isLive) &&
        Number(info.videoDetails.lengthSeconds) < 3600
      ) {
        socket.emit("request_link_accepted", {
          message: "Request accepted",
        });
        try {
          socket.emit("request_link_accepted", {
            message: "URL Metadata Fetched",
          });
          // passthrough stream
          const passStream = new stream.PassThrough();
          const randomFileName = crypto.randomBytes(8).toString("hex");
          const fileWriteStream = fs.createWriteStream(
            path.resolve(baseDownloadPath, `${randomFileName}.mp3`)
          );
          const ffmpegCommand = ffmpeg()
            .format("mp3")
            .audioCodec("libmp3lame")
            .on("start", () => {
              socket.emit("request_convert_start", {
                downloadId: randomFileName,
              });
            })
            .on("progress", (progress) => {
              socket.emit("request_convert_progress", {
                downloadId: randomFileName,
                progress: progress.percent,
              });
            })
            .on("end", () => {
              socket.emit("request_convert_finish", {
                downloadId: randomFileName,
              });
            })
            .output(fileWriteStream);
          fileWriteStream.on("finish", () => {
            console.log("Filestream finish");
          });
          const downloadStream = ytdl.downloadFromInfo(info, {
            filter: "audioonly",
            quality: "highestaudio",
          });
          // handle request accepted and start polling for download progress
          downloadStream.on("info", (info, format) => {
            console.log("info event");
            socket.emit("request_download_info", {
              downloadId: randomFileName,
              info,
              message: "Download finished for this link " + data.link,
              title: info.videoDetails.title,
              length: info.videoDetails.lengthSeconds,
              link: data.link,
            });
          });
          downloadStream.on("progress", (chunk, current, total) => {
            socket.emit("request_download_progress", {
              downloadId: randomFileName,
              title: info.videoDetails.title,
              current,
              total,
            });
          });
          downloadStream.on("end", () => {
            socket.emit("request_download_finish", {
              message: "Download finished for this link " + data.link,
              title: info.videoDetails.title,
              length: info.videoDetails.lengthSeconds,
              link: data.link,
              downloadId: randomFileName,
            });
            downloadFileNameMap.set(randomFileName, info.videoDetails.title);
          });
          downloadStream.pipe(passStream);
          ffmpegCommand.input(passStream).run();
        } catch (error) {
          console.log(error);
          socket.emit("request_link_rejected", {
            message: "Error on getting link info",
          });
        }
      } else {
        // handle rejected response because error
        socket.emit("request_link_rejected", {
          message:
            "Cannot accept live video or your video is more than 3600 seconds (one hour).",
        });
      }
    });

    // handle duplicate link

    // store user history and active downloads in database

    // use cronjobs to periodically clean-up any expired entry

    // handle request accepted and start polling for conversion progress

    // handle rejected response because download error

    // handle rejected response because conversion error

    // handle response send for successful process

    // handle any other error (500)

    // handle user deletes file from server (quota-limit)

    // handle delete success

    // handle delete fail

    // handle user disconnect (closing the app)
    socket.on("disconnect", () => {
      console.log(
        "User with id " + socketIdMap.get(socket.id) + " has disconnected"
      );
      // Probably clean-up after this
    });
  });

  server.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
  });
})();
