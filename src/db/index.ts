import mongoose, { connect, Connection, createConnection } from "mongoose";

let instance: typeof import("mongoose");
let connection: Connection;

mongoose.connection.on("connecting", () =>
  console.log("Mongoose connecting...")
);
mongoose.connection.on("connected", () => console.log("Mongoose connected!"));

export async function main() {
  try {
    mongoose.connect(process.env.MONGO_URL as string);
    return mongoose.connection;
  } catch (error) {
    console.log("Error when connecting to database");
    console.log(error);
  }
}

// main()
//   .then(() => {
//     console.log("Database connected");
//   })
//   .catch((err) => {
//     console.log("Error when connecting to database");
//     console.log(err);
//   });
