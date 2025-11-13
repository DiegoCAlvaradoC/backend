/**
 * Rutas de Autenticación
 * /api/auth/*
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sanitize, requireFields } = require('../middleware/validation');

// Rutas públicas (no requieren autenticación)
router.post('/register', 
  sanitize,
  requireFields(['ci', 'nombres', 'apellidos', 'email', 'password']),
  asyncHandler(authController.register)
);

router.post('/login',
  sanitize,
  requireFields(['password']),
  asyncHandler(authController.login)
);

router.post('/refresh',
  asyncHandler((req, res) => {
    const { refreshAccessToken } = require('../middleware/auth');
    return refreshAccessToken(req, res);
  })
);

// Rutas protegidas (requieren autenticación)
router.use(authenticate); // Middleware de autenticación para todas las rutas siguientes

router.post('/logout',
  asyncHandler(authController.logout)
);

router.get('/profile',
  asyncHandler(authController.getProfile)
);

router.patch('/profile',
  sanitize,
  asyncHandler(authController.updateProfile)
);

router.post('/change-password',
  requireFields(['currentPassword', 'newPassword']),
  asyncHandler(authController.changePassword)
);

module.exports = router;