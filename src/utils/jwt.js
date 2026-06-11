import jwt from "jsonwebtoken";
import { HttpException } from "./http-exception.js";

const SECRET = process.env.JWT_SECRET || "supersecretkey";

export const generateToken = (payload) => {
  return jwt.sign(payload, SECRET, { expiresIn: "1d" });
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, SECRET);
  } catch (err) {
    throw new HttpException(401, "Invalid or expired token");
  }
};
