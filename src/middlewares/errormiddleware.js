import { HttpException } from "../utils/http-exception.js";

export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  if (err instanceof HttpException) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  res.status(500).json({ success: false, message: "Internal Server Error" });
};
