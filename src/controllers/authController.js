import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";
import { sendEmail } from "../utils/email.js";

const accessTokenTtl = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const refreshTokenDays = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30);

const signAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: accessTokenTtl },
  );
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const issueRefreshToken = async (user, req) => {
  const rawToken = crypto.randomBytes(64).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(
    Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000,
  );

  await RefreshToken.create({
    userId: user._id,
    tokenHash,
    expiresAt,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"] || "unknown",
  });

  return rawToken;
};

const setRefreshCookie = (res, token) => {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: refreshTokenDays * 24 * 60 * 60 * 1000,
  });
};

const generateEmailVerifyToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
};

const resolveClientBaseUrl = () => {
  const fallbackUrl = "http://localhost:3000";
  const rawValue = process.env.CLIENT_URL || fallbackUrl;
  const candidates = rawValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      return new URL(candidate).toString().replace(/\/$/, "");
    } catch (error) {
      continue;
    }
  }

  return fallbackUrl;
};

const sendVerificationEmail = async (user, rawToken) => {
  const clientUrl = resolveClientBaseUrl();
  const verifyUrl = `${clientUrl}/verify-email?token=${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: "Verify your email",
    text: `Verify your email here: ${verifyUrl}`,
    html: `<div style="margin:0;padding:0;background:#f2f6ff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.06);padding:28px;border:1px solid #e6ecff;text-align:center;">

      <!-- Logo / Brand -->
      <h2 style="margin:0;color:#2563eb;font-size:22px;font-weight:700;">
        Nilal Outfits
      </h2>

      <p style="margin:10px 0 0;color:#64748b;font-size:14px;">
        Email Verification
      </p>

      <!-- Main Text -->
      <p style="margin-top:22px;color:#0f172a;font-size:15px;">
        Verify your email address to activate your account.
      </p>

      <p style="margin:8px 0 0;color:#475569;font-size:14px;">
        Click the button below to continue.
      </p>

      <!-- Button -->
      <div style="margin-top:24px;">
        <a href="${verifyUrl}" style="
          display:inline-block;
          background:#2563eb;
          color:#ffffff;
          text-decoration:none;
          padding:12px 26px;
          border-radius:10px;
          font-size:14px;
          font-weight:600;
        ">
          Verify Email
        </a>
      </div>

      <!-- Fallback Link -->
      <div style="margin-top:20px;background:#f5f8ff;padding:12px;border-radius:10px;">
        <p style="margin:0;font-size:12px;color:#64748b;">
          If the button doesn’t work, copy and paste this link:
        </p>
        <p style="margin:6px 0 0;font-size:12px;word-break:break-all;">
          <a href="${verifyUrl}" style="color:#2563eb;text-decoration:none;">
            ${verifyUrl}
          </a>
        </p>
      </div>

      <!-- Footer -->
      <p style="margin-top:22px;font-size:12px;color:#64748b;">
        If you didn’t create this account, you can safely ignore this email.
      </p>

    </div>

  </div>
</div>`,
  });
};

const sendResetEmail = async (user, rawToken) => {
  const clientUrl = resolveClientBaseUrl();
  const resetUrl = `${clientUrl}/reset-password?token=${rawToken}`;

  await sendEmail({
    to: user.email,
    subject: "Password reset request",
    text: `Reset your password here: ${resetUrl}`,
    html: `<div style="margin:0;padding:0;background:#f2f6ff;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">

    <div style="background:#ffffff;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.06);padding:28px;border:1px solid #e6ecff;text-align:center;">

      <!-- Brand -->
      <h2 style="margin:0;color:#2563eb;font-size:22px;font-weight:700;">
        Nilal Outfits
      </h2>

      <p style="margin:10px 0 0;color:#64748b;font-size:14px;">
        Password Reset
      </p>

      <!-- Message -->
      <p style="margin-top:22px;color:#0f172a;font-size:15px;">
        Forgot your password?
      </p>

      <p style="margin:8px 0 0;color:#475569;font-size:14px;">
        No worries — click the button below to reset it securely.
      </p>

      <!-- Button -->
      <div style="margin-top:24px;">
        <a href="${resetUrl}" style="
          display:inline-block;
          background:#2563eb;
          color:#ffffff;
          text-decoration:none;
          padding:12px 26px;
          border-radius:10px;
          font-size:14px;
          font-weight:600;
        ">
          Reset Password
        </a>
      </div>

      <!-- Backup Link -->
      <div style="margin-top:20px;background:#f5f8ff;padding:12px;border-radius:10px;">
        <p style="margin:0;font-size:12px;color:#64748b;">
          Button not working? Copy & paste this link:
        </p>
        <p style="margin:6px 0 0;font-size:12px;word-break:break-all;">
          <a href="${resetUrl}" style="color:#2563eb;text-decoration:none;">
            ${resetUrl}
          </a>
        </p>
      </div>

      <!-- Security Note -->
      <p style="margin-top:18px;font-size:12px;color:#64748b;">
        This link expires soon for your security.<br/>
        If you didn’t request this, you can safely ignore this email.
      </p>

    </div>

  </div>
</div>`,
  });
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const { rawToken, hashedToken } = generateEmailVerifyToken();
    const verifyExpiresMinutes = Number(
      process.env.EMAIL_VERIFY_TOKEN_EXPIRES_MINUTES || 60,
    );

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      role: "customer",
      isEmailVerified: false,
      emailVerifyToken: hashedToken,
      emailVerifyExpires: new Date(
        Date.now() + verifyExpiresMinutes * 60 * 1000,
      ),
    });

    await sendVerificationEmail(user, rawToken);

    res.status(201).json({
      message: "Registered successfully. Please verify your email.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );
    if (!user) {
      return res
        .status(401)
        .json({ message: "This email is not registered yet" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong password" });
    }

    if (!user.isEmailVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email first" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, req);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      message: "Logged in",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const refreshAccessToken = async (req, res) => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!rawToken) {
      return res.status(401).json({ message: "Refresh token required" });
    }

    const tokenHash = hashToken(rawToken);
    const storedToken = await RefreshToken.findOne({ tokenHash });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date()
    ) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(storedToken.userId);
    if (!user) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = await issueRefreshToken(user, req);

    storedToken.revokedAt = new Date();
    storedToken.replacedByTokenHash = hashToken(newRefreshToken);
    await storedToken.save();

    setRefreshCookie(res, newRefreshToken);

    res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const logout = async (req, res) => {
  try {
    const rawToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (rawToken) {
      const tokenHash = hashToken(rawToken);
      await RefreshToken.updateOne(
        { tokenHash, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    }

    res.clearCookie("refreshToken");
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const me = async (req, res) => {
  res.status(200).json({ user: req.user });
};

export const updateMe = async (req, res) => {
  try {
    const { name, phone, address } = req.body;

    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (name) {
      user.name = name;
    }

    if (phone !== undefined) {
      user.phone = phone;
    }

    if (address && typeof address === "object") {
      user.address = {
        ...user.address,
        ...address,
      };
    }

    await user.save();

    res.status(200).json({
      message: "Profile updated",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        phone: user.phone,
        address: user.address,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(200)
        .json({ message: "If that email exists, a reset link was sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = hashToken(resetToken);

    const expiresMinutes = Number(
      process.env.RESET_TOKEN_EXPIRES_MINUTES || 30,
    );
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(
      Date.now() + expiresMinutes * 60 * 1000,
    );
    await user.save({ validateBeforeSave: false });

    await sendResetEmail(user, resetToken);

    res
      .status(200)
      .json({ message: "If that email exists, a reset link was sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: "Token and new password are required" });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, req);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      message: "Password reset successful",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      emailVerifyToken: hashedToken,
      emailVerifyExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.isEmailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user, req);
    setRefreshCookie(res, refreshToken);

    res.status(200).json({
      message: "Email verified successfully",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(200)
        .json({
          message: "If that email exists, a verification link was sent",
        });
    }

    if (user.isEmailVerified) {
      return res.status(200).json({ message: "Email already verified" });
    }

    const { rawToken, hashedToken } = generateEmailVerifyToken();
    const verifyExpiresMinutes = Number(
      process.env.EMAIL_VERIFY_TOKEN_EXPIRES_MINUTES || 60,
    );

    user.emailVerifyToken = hashedToken;
    user.emailVerifyExpires = new Date(
      Date.now() + verifyExpiresMinutes * 60 * 1000,
    );
    await user.save({ validateBeforeSave: false });

    await sendVerificationEmail(user, rawToken);

    res
      .status(200)
      .json({ message: "If that email exists, a verification link was sent" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
