import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import * as dateFnsTz from "date-fns-tz";
import nodemailer from "nodemailer";
import { toZonedTime } from "date-fns-tz";

const nowUtc = new Date();
const now = toZonedTime(nowUtc, "Asia/Kolkata");


// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendTaskMail = async (to, title, description) => {
  await transporter.sendMail({
    from: `"Task System" <${process.env.EMAIL_USER}>`,
    to,
    subject: `New Task Assigned: ${title}`,
    text: `
Hello,

A new task has been created automatically.

Title: ${title}
Description: ${description ?? "N/A"}

Please login and check.

Thanks
`,
  });
};

// Cron job function that runs every minute and creates/sends recurring tasks

const checkAndSendRecurringTasks = async () => {
  const now = toZonedTime(new Date(), "Asia/Kolkata");

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDate = now.getDate();
  const currentDay = now.getDay();

  const templateTasks = await prisma.task.findMany({
    where: {
      periodSchedule: { not: null },
      isactive: true,
    },
   include: {
  taskusermap: {
    where: { isactive: true },
    include: { user: true },
  },
},
  });

  for (const task of templateTasks) {
    const schedule = JSON.parse(task.periodSchedule);
    const {
      period,
      timeOfDay,
      dayOfWeek,
      dayOfMonth,
      monthOfYear,
      endDate,
      neverEnd,
      startDate,
    } = schedule;

    if (startDate && now < new Date(startDate)) continue;

    if (!neverEnd && endDate && now > new Date(endDate)) continue;

    const [h, m] = timeOfDay.split(":").map(Number);
    if (currentHour !== h || currentMinute !== m) continue;

    let shouldRun = false;

    if (period === "daily") shouldRun = true;
    if (period === "weekly" && currentDay === dayOfWeek) shouldRun = true;
    if (period === "monthly" && currentDate === dayOfMonth) shouldRun = true;

    if (!shouldRun) continue;

    for (const map of task.taskusermap){
      const user = map.user;
      if (!user?.email) continue;

      // 🔐 DUPLICATE PREVENTION
      const alreadyCreated = await prisma.task.findFirst({
        where: {
          title: task.title,
          userid: map.userid,
          createdat: {
            gte: new Date(now.getTime() - 60 * 1000),
          },
          periodSchedule: null,
        },
      });

      if (alreadyCreated) continue;

      const newTask = await prisma.task.create({
        data: {
          title: task.title,
          description: task.description,
          userid: map.userid,
          orgid: task.orgid,
          statusId: task.statusId,
          createdby: task.createdby,
          isactive: true,
          periodSchedule: null,
        },
      });

      await prisma.taskUserMap.create({
        data: {
          taskid: newTask.id,
          userid: map.userid,
          statusId: newTask.statusId,
          createdby: task.createdby,
          isactive: true,
        },
      });

      await sendTaskMail(user.email, newTask.title, newTask.description);
    }
  }
};


// Function to start the cron job
export const recurringTask = () => {
  // Runs every minute
  cron.schedule("* * * * *", checkAndSendRecurringTasks);
};

// Your createTask API
export const createTask = async (req, res) => {
  try {
    const currentUserId = Number(req.user?.userId);
    if (!currentUserId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      title,
      description,
      userid,
      orgid,
      statusName,

      period,
      timeOfDay,
      dayOfWeek,
      dayOfMonth,
      monthOfYear,
      endDate,
      neverEnd,
    } = req.body;

    if (!title || !statusName) {
      return res.status(400).json({ message: "title & status required" });
    }

    const status = await prisma.status.findUnique({
      where: { name: statusName },
    });

    if (!status) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (period) {

      if (!neverEnd && !endDate) {
        return res.status(400).json({ message: "endDate or neverEnd required" });
      }

      if (period === "weekly" && dayOfWeek == null) {
        return res.status(400).json({ message: "dayOfWeek required" });
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        userid,
        orgid,
        statusId: status.id,
        createdby: currentUserId,
        periodSchedule: period
          ? JSON.stringify({
              period,
              timeOfDay,
              dayOfWeek,
              dayOfMonth,
              monthOfYear,
              endDate,
              neverEnd,
            })
          : null,
        isactive: true,
      },
    });

    if (userid && !period) {
      // Send mail immediately only if NOT recurring
      await prisma.taskUserMap.create({
        data: {
          taskid: task.id,
          userid,
          statusId: status.id,
          createdby: currentUserId,
          isactive: true,
        },
      });

      const assignedUser = await prisma.user.findUnique({
        where: { id: userid },
      });

      if (assignedUser?.email) {
        try {
          await sendTaskMail(assignedUser.email, title, description);
          console.log("Mail sent successfully");
        } catch (mailErr) {
          console.error("Error sending mail:", mailErr);
          return res
            .status(500)
            .json({ message: "Task created, but failed to send mail" });
        }
      }
    } else if (userid && period) {
      // Recurring task, create map but DO NOT send mail immediately
      await prisma.taskUserMap.create({
        data: {
          taskid: task.id,
          userid,
          statusId: status.id,
          createdby: currentUserId,
          isactive: true,
        },
      });
    }

    return res.status(201).json(task);
  } catch (err) {
    console.error("createTask error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
