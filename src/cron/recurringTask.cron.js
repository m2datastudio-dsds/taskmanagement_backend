import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import nodemailer from "nodemailer";
import { toZonedTime } from "date-fns-tz";

/* ------------------------------------
   MAIL CONFIG
------------------------------------ */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendTaskMail = async (to, title, description) => {
  await transporter.sendMail({
    from: `"Task System" <${process.env.EMAIL_USER}>`,
    to,
    subject: `New Task Assigned: ${title}`,
    text: `Title: ${title}\n\n${description ?? ""}`,
  });
};

/* ------------------------------------
   CRON LOGIC
   - Task is SAVED first (DB), then mail is sent (correct order).
   - Daily: run every day at timeOfDay (HH:mm).
   - Weekly: run only on stored dayOfWeek (0=Sun..6=Sat).
   - Monthly: run only on stored monthDay (date 1-31).
   - Yearly: run only on stored month + date (yearMonth 0-11, yearDay 1-31); no year check.
------------------------------------ */
const checkAndSendRecurringTasks = async () => {
  try {
    // IST time
    const now = toZonedTime(new Date(), "Asia/Kolkata");

    const hour = now.getHours();
    const minute = now.getMinutes();
    const date = now.getDate();       // 1 - 31 (day of month)
    const day = now.getDay();         // 0 = Sun, 1 = Mon, ... 6 = Sat
    const month = now.getMonth();    // 0 - 11 (for yearly match with frontend yearMonth)

    const templates = await prisma.task.findMany({
      where: {
        isactive: true,
        periodSchedule: { not: null },
      },
      include: {
        taskusermap: {
          where: { isactive: true },
          include: { user: true },
        },
      },
    });

    for (const task of templates) {
      let schedule;

      // ✅ SAFE JSON PARSE
      try {
        schedule = JSON.parse(task.periodSchedule);
      } catch (err) {
        console.error("Invalid periodSchedule. Task ID:", task.id);
        continue;
      }

      const {
        period,
        timeOfDay,
        dayOfWeek,
        monthDay,
        yearSelect,
        yearMonth,
        yearDay,
        endDate,
        neverEnd,
      } = schedule;

      if (!period || !timeOfDay) continue;

      // ⏰ TIME MATCH CHECK
      const [h, m] = timeOfDay.split(":").map(Number);
      if (h !== hour || m !== minute) continue;

      // ⛔ END DATE CHECK
      if (!neverEnd && endDate && now > new Date(endDate)) continue;

      // 📅 PERIOD CHECK: daily=time only; weekly=day; monthly=date; yearly=month+date only
      let shouldRun = false;

      if (period === "daily") {
        shouldRun = true; // every day at timeOfDay
      } else if (period === "weekly" && Number(dayOfWeek) === day) {
        shouldRun = true; // that day of week only (0=Sun..6=Sat)
      } else if (period === "monthly" && Number(monthDay) === date) {
        shouldRun = true; // that date of month only (1-31)
      } else if (
        period === "yearly" &&
        Number(yearMonth) === month &&
        Number(yearDay) === date
      ) {
        shouldRun = true; // that date + month every year (no year check)
      }

      if (!shouldRun) continue;

      /* ------------------------------------
         CREATE TASK FOR EACH USER
      ------------------------------------ */
      for (const map of task.taskusermap) {
        if (!map.user?.email) continue;

        // ❌ DUPLICATE PREVENTION (same minute)
        const exists = await prisma.task.findFirst({
          where: {
            title: task.title,
            userid: map.userid,
            periodSchedule: null,
            createdat: {
              gte: new Date(now.getTime() - 60 * 1000),
            },
          },
        });

        if (exists) continue;

        // ✅ CREATE TASK
        const newTask = await prisma.task.create({
          data: {
            title: task.title,
            description: task.description,
            userid: map.userid,
            statusId: task.statusId,
            createdby: task.createdby,
            orgid: task.orgid,
            isactive: true,
            periodSchedule: null, // IMPORTANT
          },
        });

        // ✅ MAP USER
        await prisma.taskUserMap.create({
          data: {
            taskid: newTask.id,
            userid: map.userid,
            statusId: newTask.statusId,
            createdby: task.createdby,
            isactive: true,
          },
        });

        // 📧 SEND MAIL
        await sendTaskMail(
          map.user.email,
          newTask.title,
          newTask.description
        );
      }
    }
  } catch (err) {
    console.error("Recurring task cron error:", err);
  }
};

/* ------------------------------------
   CRON START
------------------------------------ */
export const recurringTask = () => {
  // runs every minute
  cron.schedule("* * * * *", checkAndSendRecurringTasks);
};