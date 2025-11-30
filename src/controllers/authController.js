// controllers/authController.js
const authService = require('../services/authService');

/**
 * Controlador de Autenticación
 * Maneja todas las operaciones relacionadas con autenticación y autorización
 */
class AuthController {

    /**
     * Registrar un nuevo usuario
     * POST /api/auth/register
     */
    async register(req, res) {
        try {
            const {
                email,
                password,
                nombre_completo,
                ci,
                celular,
                rol
            } = req.body;

            // Validaciones básicas
            if (!email || !password || !nombre_completo) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos faltantes',
                    message: 'Email, password y nombre completo son requeridos'
                });
            }

            // Validar formato de email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'Email inválido',
                    message: 'Por favor ingresa un email válido'
                });
            }

            // Validar longitud de password
            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password inválido',
                    message: 'El password debe tener al menos 8 caracteres'
                });
            }

            // Registrar usuario
            const result = await authService.registrarUsuario({
                email,
                password,
                nombre_completo,
                ci,
                celular,
                rol: rol || 'ESTUDIANTE'
            });

            res.status(201).json({
                success: true,
                message: 'Usuario registrado exitosamente',
                data: result
            });

        } catch (error) {
            console.error('Error en register:', error);

            if (error.message.includes('ya está registrado')) {
                return res.status(409).json({
                    success: false,
                    error: 'Conflicto',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error en el registro',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al registrar usuario'
            });
        }
    }

    /**
     * Login de usuario
     * POST /api/auth/login
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Validaciones básicas
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos faltantes',
                    message: 'Email y password son requeridos'
                });
            }

            // Intentar login
            const result = await authService.login(email, password);

            res.json({
                success: true,
                message: 'Login exitoso',
                data: result
            });

        } catch (error) {
            console.error('Error en login:', error);

            // Errores específicos
            if (error.message.includes('Credenciales inválidas')) {
                return res.status(401).json({
                    success: false,
                    error: 'Autenticación fallida',
                    message: 'Email o password incorrectos'
                });
            }

            if (error.message.includes('bloqueada temporalmente')) {
                return res.status(403).json({
                    success: false,
                    error: 'Cuenta bloqueada',
                    message: error.message
                });
            }

            if (error.message.includes('inactivo')) {
                return res.status(403).json({
                    success: false,
                    error: 'Usuario inactivo',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error en el login',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al iniciar sesión'
            });
        }
    }

    /**
     * Refresh access token
     * POST /api/auth/refresh
     */
    async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                return res.status(400).json({
                    success: false,
                    error: 'Refresh token requerido',
                    message: 'Debes proporcionar un refresh token'
                });
            }

            const result = await authService.refreshAccessToken(refreshToken);

            res.json({
                success: true,
                message: 'Token renovado exitosamente',
                data: result
            });

        } catch (error) {
            console.error('Error en refreshToken:', error);

            res.status(401).json({
                success: false,
                error: 'Token inválido',
                message: 'El refresh token es inválido o ha expirado'
            });
        }
    }

    /**
     * Logout de usuario
     * POST /api/auth/logout
     */
    async logout(req, res) {
        try {
            const usuarioId = req.usuario.id; // Del middleware de autenticación
            const { refreshToken } = req.body;

            await authService.logout(usuarioId, refreshToken);

            res.json({
                success: true,
                message: 'Logout exitoso'
            });

        } catch (error) {
            console.error('Error en logout:', error);

            res.status(500).json({
                success: false,
                error: 'Error en logout',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al cerrar sesión'
            });
        }
    }

    /**
     * Verificar token de acceso
     * GET /api/auth/verify
     */
    async verifyToken(req, res) {
        try {
            const token = req.headers.authorization?.replace('Bearer ', '');

            if (!token) {
                return res.status(401).json({
                    success: false,
                    error: 'Token no proporcionado',
                    message: 'Se requiere un token de autenticación'
                });
            }

            const result = await authService.verificarToken(token);

            if (!result.valido) {
                return res.status(401).json({
                    success: false,
                    error: 'Token inválido',
                    message: result.error
                });
            }

            res.json({
                success: true,
                message: 'Token válido',
                data: {
                    valido: true,
                    usuario: result.usuario
                }
            });

        } catch (error) {
            console.error('Error en verifyToken:', error);

            res.status(500).json({
                success: false,
                error: 'Error al verificar token',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al verificar autenticación'
            });
        }
    }

    /**
     * Obtener perfil del usuario autenticado
     * GET /api/auth/profile
     */
    async getProfile(req, res) {
        try {
            const usuarioId = req.usuario.id; // Del middleware de autenticación

            const perfil = await authService.obtenerPerfil(usuarioId);

            res.json({
                success: true,
                data: { usuario: perfil }
            });

        } catch (error) {
            console.error('Error en getProfile:', error);

            res.status(500).json({
                success: false,
                error: 'Error al obtener perfil',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al obtener información del perfil'
            });
        }
    }

    /**
     * Actualizar perfil del usuario autenticado
     * PATCH /api/auth/profile
     */
    async updateProfile(req, res) {
        try {
            const usuarioId = req.usuario.id; // Del middleware de autenticación
            const { nombre_completo, celular } = req.body;

            const perfilActualizado = await authService.actualizarPerfil(usuarioId, {
                nombre_completo,
                celular
            });

            res.json({
                success: true,
                message: 'Perfil actualizado exitosamente',
                data: { usuario: perfilActualizado }
            });

        } catch (error) {
            console.error('Error en updateProfile:', error);

            res.status(500).json({
                success: false,
                error: 'Error al actualizar perfil',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al actualizar información del perfil'
            });
        }
    }

    /**
     * Cambiar contraseña
     * POST /api/auth/change-password
     */
    async changePassword(req, res) {
        try {
            const usuarioId = req.usuario.id; // Del middleware de autenticación
            const { passwordActual, passwordNuevo } = req.body;

            // Validaciones
            if (!passwordActual || !passwordNuevo) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos',
                    message: 'La contraseña actual y nueva son requeridas'
                });
            }

            if (passwordNuevo.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password inválido',
                    message: 'La nueva contraseña debe tener al menos 8 caracteres'
                });
            }

            await authService.cambiarPassword(usuarioId, passwordActual, passwordNuevo);

            res.json({
                success: true,
                message: 'Contraseña actualizada exitosamente'
            });

        } catch (error) {
            console.error('Error en changePassword:', error);

            if (error.message.includes('incorrecta')) {
                return res.status(400).json({
                    success: false,
                    error: 'Contraseña incorrecta',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al cambiar contraseña',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al actualizar contraseña'
            });
        }
    }

    /**
     * Solicitar reset de password
     * POST /api/auth/forgot-password
     */
    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email requerido',
                    message: 'Debes proporcionar un email'
                });
            }

            const result = await authService.solicitarResetPassword(email);

            res.json({
                success: true,
                message: result.message,
                ...(process.env.NODE_ENV === 'development' && result.resetToken && {
                    resetToken: result.resetToken
                })
            });

        } catch (error) {
            console.error('Error en forgotPassword:', error);

            res.status(500).json({
                success: false,
                error: 'Error al procesar solicitud',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al procesar la solicitud'
            });
        }
    }

    /**
     * Resetear password con token
     * POST /api/auth/reset-password
     */
    async resetPassword(req, res) {
        try {
            const { token, nuevoPassword } = req.body;

            // Validaciones
            if (!token || !nuevoPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos',
                    message: 'Token y nueva contraseña son requeridos'
                });
            }

            if (nuevoPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    error: 'Password inválido',
                    message: 'La contraseña debe tener al menos 8 caracteres'
                });
            }

            await authService.resetearPassword(token, nuevoPassword);

            res.json({
                success: true,
                message: 'Contraseña reseteada exitosamente'
            });

        } catch (error) {
            console.error('Error en resetPassword:', error);

            if (error.message.includes('inválido') || error.message.includes('expirado')) {
                return res.status(400).json({
                    success: false,
                    error: 'Token inválido',
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error al resetear contraseña',
                message: process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'Error al resetear contraseña'
            });
        }
    }

    /**
     * Health check del servicio de autenticación
     * GET /api/auth/health
     */
    async healthCheck(req, res) {
        try {
            const health = await authService.healthCheck();

            const statusCode = health.status === 'healthy' ? 200 : 503;

            res.status(statusCode).json({
                success: health.status === 'healthy',
                data: health
            });

        } catch (error) {
            console.error('Error en health check:', error);

            res.status(503).json({
                success: false,
                error: 'Health check falló',
                message: error.message
            });
        }
    }
}

module.exports = new AuthController();