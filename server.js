import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { clerkMiddleware } from '@clerk/express';
import aiRouter from './routes/aiRoutes.js';
import connectCloudinary from './configs/cloudinary.js';
import userRouter from './routes/userRoutes.js';
const app = express();
await connectCloudinary()
app.use(cors());
app.use(express.json());
app.use(clerkMiddleware()); // adds req.auth

app.get('/', (req, res) => res.send('ClaroAI Server is running'));

// Mount AI routes
app.use('/api/ai', aiRouter);

//User routes
app.use('/api/user', userRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
