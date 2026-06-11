import bcrypt from "bcryptjs";

bcrypt.hash("superadmin123", 10).then(console.log);
