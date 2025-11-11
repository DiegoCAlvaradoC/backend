// middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Middleware de autenticación JWT
 * Verifica y valida el token de acceso en las peticiones
 */
const authenticate = async (req, res, next) => {
    try {
        // Obtener token del header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado',
                message: 'Token de autenticación no proporcionado'
            });
        }

        const token = authHeader.replace('Bearer ', '');

        // Verificar token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025'
        );

        // Verificar que sea un access token
        if (decoded.tipo !== 'access') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido',
                message: 'El token proporcionado no es un access token'
            });
        }

        // Verificar que el usuario existe y está activo
        const result = await pool.query(
            'SELECT id, email, rol, estado FROM auth.usuarios WHERE id = $1',
            [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Usuario no encontrado',
                message: 'El usuario asociado al token no existe'
            });
        }

        const usuario = result.rows[0];

        if (usuario.estado !== 'ACTIVO') {
            return res.status(403).json({
                success: false,
                error: 'Usuario inactivo',
                message: 'Tu cuenta está inactiva. Contacta al administrador.'
            });
        }

        // Agregar información del usuario al request
        req.usuario = {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol
        };

        next();

    } catch (error) {
        console.error('Error en middleware de autenticación:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido',
                message: 'El token de autenticación es inválido'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expirado',
                message: 'El token de autenticación ha expirado'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Error de autenticación',
            message: 'Error al validar autenticación'
        });
    }
};

/**
 * Middleware de autorización por roles
 * Verifica que el usuario tenga uno de los roles permitidos
 */
const authorize = (...rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado',
                message: 'Debes estar autenticado para acceder a este recurso'
            });
        }

        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({
                success: false,
                error: 'No autorizado',
                message: 'No tienes permisos para acceder a este recurso',
                rolRequerido: rolesPermitidos,
                tuRol: req.usuario.rol
            });
        }

        next();
    };
};

/**
 * Middleware opcional de autenticación
 * No falla si no hay token, solo agrega información si existe
 */
const authenticateOptional = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Continuar sin autenticación
        }

        const token = authHeader.replace('Bearer ', '');

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025'
        );

        if (decoded.tipo === 'access') {
            const result = await pool.query(
                'SELECT id, email, rol, estado FROM auth.usuarios WHERE id = $1 AND estado = $2',
                [decoded.id, 'ACTIVO']
            );

            if (result.rows.length > 0) {
                const usuario = result.rows[0];
                req.usuario = {
                    id: usuario.id,
                    email: usuario.email,
                    rol: usuario.rol
                };
            }
        }

        next();

    } catch (error) {
        // Ignorar errores y continuar sin autenticación
        next();
    }
};

module.exports = {
    authenticate,
    authorize,
    authenticateOptional
};