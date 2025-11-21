import sql from '../configs/db.js';
import fetch from 'node-fetch';

// Get all creations for a specific user
export const getUserCreations = async (req, res) => {
  try {
    const { userId } = req.auth();
    const creations = await sql`
      SELECT * FROM creations 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    res.json({ success: true, creations });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// Get all published creations for community
export const getPublishedCreations = async (req, res) => {
  try {
    const creations = await sql`
      SELECT * FROM creations 
      WHERE publish = true
      ORDER BY created_at DESC
    `;
    res.json({ success: true, creations });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// Like/unlike creation
export const toggleLikeCreation = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { id } = req.body;

    const [creation] = await sql`SELECT * FROM creations WHERE id = ${id}`;
    if (!creation) return res.json({ success: false, message: 'Creation not found' });

    const currentLikes = creation.likes || [];
    const userIdStr = String(userId);
    let updatedLikes;
    let message;

    if (currentLikes.includes(userIdStr)) {
      updatedLikes = currentLikes.filter(uid => uid !== userIdStr);
      message = 'Creation unliked';
    } else {
      updatedLikes = [...currentLikes, userIdStr];
      message = 'Creation liked';
    }

    // format array for PostgreSQL
    const formattedArray = `{${updatedLikes.join(',')}}`;

    await sql`UPDATE creations SET likes = ${formattedArray}::text[] WHERE id = ${id}`;

    res.json({ success: true, message });
  } catch (err) {
    console.error(err.message);
    res.json({ success: false, message: err.message });
  }
};

// Save generated creation
export const saveCreation = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { prompt, content, type, publish } = req.body;

    const [creation] = await sql`
      INSERT INTO creations (user_id, prompt, content, type, publish)
      VALUES (${userId}, ${prompt}, ${content}, ${type}, ${publish})
      RETURNING *
    `;
    res.json({ success: true, creation });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
