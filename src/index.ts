import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import cors from "cors";
import crypto from "crypto";
import { Server } from "socket.io";
import ytdl from "ytdl-core";

import ytdlMap from "./ytdl";
import { IRequestLinkEventData } from "./interfaces/Request";

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

const PORT = 5000;

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
      fs.existsSync(path.resolve(baseDownloadPath, `${code}.mp4`)) &&
      downloadFileNameMap.has(code)
    ) {
      const filenameSent = downloadFileNameMap.get(code) || "(unset)";
      return res.download(
        path.resolve(baseDownloadPath, `${code}.mp4`),
        `${filenameSent}.mp4`
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
  cors: {
    origin: "*",
  },
});

const socketIdMap = new Map<string, string>();
const downloadFileNameMap = new Map<string, string>();

io.on("connection", (socket) => {
  // handle user initialization
  if (socket.handshake.headers.clientid !== "") {
    console.log(
      "A non-new user connected with id " + socket.handshake.headers.clientid
    );
    socketIdMap.set(socket.id, socket.handshake.headers.clientid as string);
    // load the history then send to user
  } else {
    const id = crypto.randomBytes(32).toString("hex");
    console.log("A new user connected. Giving id " + id);
    socket.emit("handshake_id", {
      clientId: id,
    });
    socketIdMap.set(socket.id, id);
  }

  // handle request for download
  socket.on("request_link", async (data: IRequestLinkEventData) => {
    console.log(data);
    if (data.link) {
      socket.emit("request_link_accepted", {
        message: "Request accepted",
      });
      try {
        const info = await ytdl.getInfo(data.link);
        socket.emit("request_link_accepted", {
          message: "URL Metadata Fetched",
        });
        console.log(info);
        const randomFileName = crypto.randomBytes(8).toString("hex");
        const fileWriteStream = fs.createWriteStream(
          path.resolve(baseDownloadPath, `${randomFileName}.mp4`)
        );

        fileWriteStream.on("finish", () => {
          console.log("Download finish");
          socket.emit("request_download_finish", {
            message: "Download finished for this link " + data.link,
            title: info.videoDetails.title,
            length: info.videoDetails.lengthSeconds,
            link: data.link,
            downloadId: randomFileName,
          });
          downloadFileNameMap.set(randomFileName, info.videoDetails.title);
        });
        const downloadStream = ytdl.downloadFromInfo(info, {
          quality: "highestaudio",
        });
        downloadStream.on("progress", (chunk, current, total) => {
          socket.emit("request_download_progress", {
            title: info.videoDetails.title,
            current,
            total,
          });
        });
        downloadStream.pipe(fileWriteStream);
      } catch (error) {
        console.log(error);
        socket.emit("request_link_rejected", {
          message: "Error on getting link info",
        });
      }
    } else {
      // handle rejected response because error
      socket.emit("request_link_rejected", {
        message: "Incorrect link",
      });
    }
  });

  // handle request accepted and start polling for download progress

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
