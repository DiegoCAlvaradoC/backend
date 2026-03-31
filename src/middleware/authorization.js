// middleware/authorization.js

/**
 * Middleware de Autorización por Roles
 * Verifica que el usuario tenga uno de los roles permitidos
 */

/**
 * Verificar que el usuario tenga uno de los roles especificados
 * @param {Array<string>} rolesPermitidos - Lista de roles que pueden acceder
 * @returns {Function} Middleware de Express
 */
const requireRole = (rolesPermitidos) => {
    return (req, res, next) => {
        // Verificar que el usuario esté autenticado
        if (!req.usuario) {
            return res.status(401).json({
                success: false,
                error: 'No autenticado',
                message: 'Debes iniciar sesión para acceder a este recurso'
            });
        }

        // Verificar que el usuario tenga el rol requerido
        if (!rolesPermitidos.includes(req.usuario.rol)) {
            console.log(` Acceso denegado - Usuario: ${req.usuario.email}, Rol: ${req.usuario.rol}, Roles permitidos: ${rolesPermitidos.join(', ')}`);

            return res.status(403).json({
                success: false,
                error: 'Acceso denegado',
                message: `No tienes permisos suficientes. Se requiere uno de estos roles: ${rolesPermitidos.join(', ')}`
            });
        }

        console.log(` Acceso permitido - Usuario: ${req.usuario.email}, Rol: ${req.usuario.rol}`);

        // El usuario tiene el rol requerido, continuar
        next();
    };
};

/**
 * Middleware para verificar que el usuario sea ADMINISTRADOR
 */
const requireAdmin = requireRole(['ADMINISTRADOR']);

/**
 * Middleware para verificar que el usuario sea ADMINISTRATIVO o ADMINISTRADOR
 */
const requireAdministrativo = requireRole(['ADMINISTRATIVO', 'ADMINISTRADOR']);

/**
 * Middleware para verificar que el usuario sea ESTUDIANTE, ADMINISTRATIVO o ADMINISTRADOR
 */
const requireAnyRole = requireRole(['ESTUDIANTE', 'ADMINISTRATIVO', 'ADMINISTRADOR']);

module.exports = {
    requireRole,
    requireAdmin,
    requireAdministrativo,
    requireAnyRole
};