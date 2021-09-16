import { convertToMp3 } from "./converter";
import path from "path";
import os from "os";
import fs from "fs";

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

(async () => {
  const res = await convertToMp3(
    "./temp/82f5e74e8147755c.mp4",
    "./temp/82f5e74e8147755c.mp3"
  );
})();
