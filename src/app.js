import express from "express";
import cors from "cors";
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/errormiddleware.js";
import { recurringTask } from "./cron/recurringTask.cron.js";
import path from "path";

const app = express();

if (process.env.ENABLE_RECURRING_TASK_CRON === "true") {
  recurringTask();
}

app.use(cors());
app.use(express.json());

app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    setHeaders: (res, filePath) => {
      const fp = filePath.toLowerCase();

      // jfif is basically jpeg
      if (fp.endsWith(".jfif")) {
        res.setHeader("Content-Type", "image/jpeg");
      }
    },
  })
);

// main route handler
app.use("/api", routes);

// global error handler
app.use(errorHandler);

export default app;
