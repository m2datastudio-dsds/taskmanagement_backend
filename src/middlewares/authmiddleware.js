import jwt from "jsonwebtoken";
import { HttpException } from "../utils/http-exception.js";

export const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || req.headers["Authorization"];
    if (!authHeader) return next(new HttpException(401, "Authorization header missing"));

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return next(new HttpException(401, "Invalid authorization header format. Use: Bearer <token>"));
    }

    const token = parts[1];

    // verify token
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT verify error:", err);
      return next(new HttpException(401, "Invalid or expired token"));
    }

    // standardize req.user shape (expected by controllers)
    // e.g. { userId: "...", role: "admin" }
    req.user = {
      userId: payload.userId ?? payload.id ?? payload.sub, // support common keys
      role: payload.role ?? null,
      orgId: payload.orgId ?? null,
      raw: payload,
    };

    if (!req.user.userId) {
      return next(new HttpException(401, "Token payload missing user id"));
    }

    return next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return next(new HttpException(500, "Authentication middleware error"));
  }
};
