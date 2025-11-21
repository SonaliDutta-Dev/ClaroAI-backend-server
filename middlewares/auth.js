import { requireAuth, clerkClient } from "@clerk/express";

// Use as route middleware
export const auth = async (req, res, next) => {
  try {
    // requireAuth already adds req.auth
    const { userId } = req.auth;

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Check premium plan
    const user = await clerkClient.users.getUser(userId);
    const free_usage = user.privateMetadata?.free_usage ?? 0;

    req.plan = user.privateMetadata?.plan === "premium" ? "premium" : "free";
    req.free_usage = free_usage;

    next();
  } catch (err) {
    console.log("AUTH ERROR →", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
