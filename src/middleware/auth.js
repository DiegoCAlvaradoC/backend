// middleware/auth.js
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

/**
 * Constantes de roles del sistema
 */
const ROLES = {
    ADMIN: 'admin',
    OPERADOR_ADMISIONES: 'staff',
    USUARIO: 'user'
};

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
const authorize = (rolesPermitidos) => {
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

/**
 * Genera tokens de acceso y refresh para un usuario
 */
const generateTokens = (usuario) => {
    const accessToken = jwt.sign(
        {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol,
            tipo: 'access'
        },
        process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025',
        { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    const refreshToken = jwt.sign(
        {
            id: usuario.id,
            tipo: 'refresh'
        },
        process.env.JWT_REFRESH_SECRET || 'ucb-admissions-refresh-secret-2025',
        { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    );

    return { accessToken, refreshToken };
};

/**
 * Verifica y refresca el access token usando un refresh token
 */
const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Token no proporcionado',
                message: 'El refresh token es requerido'
            });
        }

        // Verificar refresh token
        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET || 'ucb-admissions-refresh-secret-2025'
        );

        if (decoded.tipo !== 'refresh') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido',
                message: 'El token proporcionado no es un refresh token'
            });
        }

        // Obtener usuario
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
                message: 'Tu cuenta está inactiva'
            });
        }

        // Generar nuevo access token
        const tokens = generateTokens(usuario);

        res.json({
            success: true,
            message: 'Token renovado exitosamente',
            data: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                usuario: {
                    id: usuario.id,
                    email: usuario.email,
                    rol: usuario.rol
                }
            }
        });

    } catch (error) {
        console.error('Error al refrescar token:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                error: 'Token inválido',
                message: 'El refresh token es inválido'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token expirado',
                message: 'El refresh token ha expirado. Inicia sesión nuevamente.'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Error al refrescar token',
            message: 'Error interno del servidor'
        });
    }
};

module.exports = {
    ROLES,                    // ← EXPORTAR ROLES
    authenticate,
    authorize,
    authenticateOptional,
    generateTokens,
    refreshAccessToken
};