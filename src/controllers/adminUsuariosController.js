// controllers/adminUsuariosController.js
const adminUsuariosService = require('../services/adminUsuariosService');

/**
 * Controlador de Administración de Usuarios
 * Solo accesible por usuarios con rol ADMINISTRADOR
 */
class AdminUsuariosController {

    /**
     * Obtener todos los usuarios con filtros y paginación
     * GET /api/admin/usuarios
     */
    async getUsuarios(req, res) {
        try {
            // Verificar que el usuario sea administrador
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden acceder a esta función'
                });
            }

            const {
                pagina = 1,
                limite = 20,
                rol,
                estado,
                busqueda
            } = req.query;

            const result = await adminUsuariosService.obtenerUsuarios({
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                rol,
                estado,
                busqueda
            });

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            console.error('Error en getUsuarios:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener usuarios',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Obtener un usuario por ID
     * GET /api/admin/usuarios/:id
     */
    async getUsuarioById(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden acceder a esta función'
                });
            }

            const { id } = req.params;

            const usuario = await adminUsuariosService.obtenerUsuarioPorId(id);

            res.json({
                success: true,
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en getUsuarioById:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al obtener usuario',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Crear un nuevo usuario
     * POST /api/admin/usuarios
     */
    async createUsuario(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden crear usuarios'
                });
            }

            const {
                email,
                password,
                nombre_completo,
                ci,
                celular,
                rol
            } = req.body;

            // Validaciones
            if (!email || !password || !nombre_completo) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos faltantes',
                    message: 'Email, password y nombre completo son obligatorios'
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password inválido',
                    message: 'La contraseña debe tener al menos 8 caracteres'
                });
            }

            const usuario = await adminUsuariosService.crearUsuario({
                email,
                password,
                nombre_completo,
                ci,
                celular,
                rol: rol || 'ESTUDIANTE'
            });

            res.status(201).json({
                success: true,
                message: 'Usuario creado exitosamente',
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en createUsuario:', error);

            if (error.message.includes('ya está registrado')) {
                return res.status(409).json({
                    success: false,
                    error: 'Conflicto',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al crear usuario',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Actualizar datos de un usuario
     * PATCH /api/admin/usuarios/:id
     */
    async updateUsuario(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden actualizar usuarios'
                });
            }

            const { id } = req.params;
            const updates = req.body;

            const usuario = await adminUsuariosService.actualizarUsuario(id, updates);

            res.json({
                success: true,
                message: 'Usuario actualizado exitosamente',
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en updateUsuario:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al actualizar usuario',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Cambiar rol de un usuario
     * PATCH /api/admin/usuarios/:id/rol
     */
    async changeRol(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden cambiar roles'
                });
            }

            const { id } = req.params;
            const { rol } = req.body;

            if (!rol || !['ESTUDIANTE', 'ADMINISTRATIVO', 'ADMINISTRADOR'].includes(rol)) {
                return res.status(400).json({
                    success: false,
                    error: 'Rol inválido',
                    message: 'El rol debe ser ESTUDIANTE, ADMINISTRATIVO o ADMINISTRADOR'
                });
            }

            const usuario = await adminUsuariosService.cambiarRol(id, rol);

            res.json({
                success: true,
                message: 'Rol actualizado exitosamente',
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en changeRol:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al cambiar rol',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Cambiar estado de un usuario
     * PATCH /api/admin/usuarios/:id/estado
     */
    async changeEstado(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden cambiar el estado'
                });
            }

            const { id } = req.params;
            const { estado } = req.body;

            if (!estado || !['ACTIVO', 'INACTIVO', 'BLOQUEADO'].includes(estado)) {
                return res.status(400).json({
                    success: false,
                    error: 'Estado inválido',
                    message: 'El estado debe ser ACTIVO, INACTIVO o BLOQUEADO'
                });
            }

            const usuario = await adminUsuariosService.cambiarEstado(id, estado);

            res.json({
                success: true,
                message: 'Estado actualizado exitosamente',
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en changeEstado:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al cambiar estado',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Desbloquear usuario (resetear intentos fallidos)
     * POST /api/admin/usuarios/:id/desbloquear
     */
    async unlockUsuario(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden desbloquear usuarios'
                });
            }

            const { id } = req.params;

            const usuario = await adminUsuariosService.desbloquearUsuario(id);

            res.json({
                success: true,
                message: 'Usuario desbloqueado exitosamente',
                data: { usuario }
            });

        } catch (error) {
            console.error('Error en unlockUsuario:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al desbloquear usuario',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Resetear contraseña de un usuario
     * POST /api/admin/usuarios/:id/reset-password
     */
    async resetPassword(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden resetear contraseñas'
                });
            }

            const { id } = req.params;
            const { nueva_password } = req.body;

            if (!nueva_password || nueva_password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password inválido',
                    message: 'La nueva contraseña debe tener al menos 8 caracteres'
                });
            }

            await adminUsuariosService.resetearPassword(id, nueva_password);

            res.json({
                success: true,
                message: 'Contraseña reseteada exitosamente'
            });

        } catch (error) {
            console.error('Error en resetPassword:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al resetear contraseña',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Eliminar un usuario (soft delete)
     * DELETE /api/admin/usuarios/:id
     */
    async deleteUsuario(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden eliminar usuarios'
                });
            }

            const { id } = req.params;

            // No permitir que el admin se elimine a sí mismo
            if (id === req.usuario.id) {
                return res.status(400).json({
                    success: false,
                    error: 'Operación no permitida',
                    message: 'No puedes eliminar tu propia cuenta'
                });
            }

            await adminUsuariosService.eliminarUsuario(id);

            res.json({
                success: true,
                message: 'Usuario eliminado exitosamente'
            });

        } catch (error) {
            console.error('Error en deleteUsuario:', error);

            if (error.message.includes('no encontrado')) {
                return res.status(404).json({
                    success: false,
                    error: 'Usuario no encontrado',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al eliminar usuario',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }

    /**
     * Obtener estadísticas de usuarios
     * GET /api/admin/usuarios/stats
     */
    async getStats(req, res) {
        try {
            if (req.usuario.rol !== 'ADMINISTRADOR') {
                return res.status(403).json({
                    success: false,
                    error: 'Acceso denegado',
                    message: 'Solo los administradores pueden ver estadísticas'
                });
            }

            const stats = await adminUsuariosService.obtenerEstadisticas();

            res.json({
                success: true,
                data: stats
            });

        } catch (error) {
            console.error('Error en getStats:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener estadísticas',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error en el servidor'
            });
        }
    }
}

module.exports = new AdminUsuariosController();