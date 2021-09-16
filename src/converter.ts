import ffmpeg from "fluent-ffmpeg";

export function convertToMp3(inFilepath: string, outFilepath: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      const command = ffmpeg(inFilepath);
      command
        .on("start", () => {
          console.log("Conversion started");
        })
        .on("progress", (progress) => {
          console.log(
            `Conversion progress ${Number(progress.percent).toPrecision(2)}%`
          );
        })
        .on("end", () => {
          console.log("Conversion success!");
          resolve();
        })
        .save(outFilepath);
    } catch (error) {
      console.error(error);
      reject(error);
    }
  });
}
