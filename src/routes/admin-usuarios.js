// routes/admin-usuarios.js
const express = require('express');
const router = express.Router();
const adminUsuariosController = require('../controllers/adminUsuariosController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Rutas de Administración de Usuarios
 * Todas requieren autenticación y rol ADMINISTRADOR
 */

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// Middleware de autorización (solo ADMINISTRADOR)
router.use(authorize(['ADMINISTRADOR'])); // ← LLAMAR CON EL ROL PERMITIDO

// Estadísticas (antes de la ruta con :id para evitar conflictos)
router.get('/stats', adminUsuariosController.getStats);

// CRUD de usuarios
router.get('/', adminUsuariosController.getUsuarios);
router.post('/', adminUsuariosController.createUsuario);
router.get('/:id', adminUsuariosController.getUsuarioById);
router.patch('/:id', adminUsuariosController.updateUsuario);
router.delete('/:id', adminUsuariosController.deleteUsuario);

module.exports = router;