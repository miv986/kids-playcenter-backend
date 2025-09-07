import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    // Test Supabase connection
    const { data, error } = await supabase
      .from('_supabase_migrations')
      .select('version')
      .limit(1);

    const isSupabaseConnected = !error;

    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      supabase: {
        connected: isSupabaseConnected,
        url: process.env.SUPABASE_URL ? 'configured' : 'missing'
      },
      server: {
        port: process.env.PORT || 4000,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

export default router;