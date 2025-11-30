// services/authService.js
const { pool } = require('../config/database'); // ✅ CORREGIDO: Desestructurar pool
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Servicio de Autenticación y Autorización
 * Maneja login, registro, tokens JWT, refresh tokens y gestión de sesiones
 */
class AuthService {

    /**
     * Registrar un nuevo usuario
     * @param {Object} userData - Datos del usuario
     * @returns {Object} Usuario creado (sin password)
     */
    async registrarUsuario(userData) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const {
                email,
                password,
                nombre_completo,
                ci,
                celular,
                rol = 'ESTUDIANTE',
                estado = 'ACTIVO'
            } = userData;

            // Validar si el email ya existe
            const emailExists = await client.query(
                'SELECT id FROM auth.usuarios WHERE email = $1',
                [email]
            );

            if (emailExists.rows.length > 0) {
                throw new Error('El email ya está registrado');
            }

            // Validar si el CI ya existe
            if (ci) {
                const ciExists = await client.query(
                    'SELECT id FROM auth.usuarios WHERE ci = $1',
                    [ci]
                );

                if (ciExists.rows.length > 0) {
                    throw new Error('El CI ya está registrado');
                }
            }

            // Hash del password
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Insertar usuario
            const insertQuery = `
                INSERT INTO auth.usuarios (
                    email, password_hash, nombre_completo, ci, celular, 
                    rol, estado, fecha_creacion, ultimo_acceso
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                RETURNING id, email, nombre_completo, ci, celular, rol, estado, fecha_creacion
            `;

            const result = await client.query(insertQuery, [
                email,
                hashedPassword,
                nombre_completo,
                ci,
                celular,
                rol,
                estado
            ]);

            await client.query('COMMIT');

            const usuario = result.rows[0];

            // Generar tokens
            const tokens = this.generarTokens(usuario);

            // Guardar refresh token
            await this.guardarRefreshToken(usuario.id, tokens.refreshToken);

            return {
                usuario: {
                    id: usuario.id,
                    email: usuario.email,
                    nombreCompleto: usuario.nombre_completo,
                    ci: usuario.ci,
                    celular: usuario.celular,
                    rol: usuario.rol,
                    estado: usuario.estado
                },
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken
            };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Login de usuario
     * @param {string} email - Email del usuario
     * @param {string} password - Password del usuario
     * @returns {Object} Usuario y tokens
     */
    async login(email, password) {
        const client = await pool.connect();

        try {
            // Buscar usuario
            const query = `
                SELECT id, email, password_hash, nombre_completo, ci, celular, 
                       rol, estado, intentos_fallidos, bloqueado_hasta
                FROM auth.usuarios
                WHERE email = $1
            `;

            const result = await client.query(query, [email]);

            if (result.rows.length === 0) {
                throw new Error('Credenciales inválidas');
            }

            const usuario = result.rows[0];

            // Verificar si está bloqueado
            if (usuario.bloqueado_hasta && new Date(usuario.bloqueado_hasta) > new Date()) {
                const minutosRestantes = Math.ceil((new Date(usuario.bloqueado_hasta) - new Date()) / 60000);
                throw new Error(`Cuenta bloqueada temporalmente. Intenta en ${minutosRestantes} minutos.`);
            }

            // Verificar estado
            if (usuario.estado !== 'ACTIVO') {
                throw new Error('Usuario inactivo. Contacta al administrador.');
            }

            // Verificar password
            const passwordValido = await bcrypt.compare(password, usuario.password_hash);

            if (!passwordValido) {
                // Incrementar intentos fallidos
                await this.registrarIntentoFallido(client, usuario.id);
                throw new Error('Credenciales inválidas');
            }

            // Reset intentos fallidos y actualizar último acceso
            await client.query(
                'UPDATE auth.usuarios SET intentos_fallidos = 0, ultimo_acceso = NOW() WHERE id = $1',
                [usuario.id]
            );

            // Generar tokens
            const tokens = this.generarTokens(usuario);

            // Guardar refresh token
            await this.guardarRefreshToken(usuario.id, tokens.refreshToken);

            // Registrar sesión
            await this.registrarSesion(client, usuario.id, tokens.accessToken);

            return {
                usuario: {
                    id: usuario.id,
                    email: usuario.email,
                    nombreCompleto: usuario.nombre_completo,
                    ci: usuario.ci,
                    celular: usuario.celular,
                    rol: usuario.rol,
                    estado: usuario.estado
                },
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken
            };

        } finally {
            client.release();
        }
    }

    /**
     * Registrar intento fallido de login
     */
    async registrarIntentoFallido(client, usuarioId) {
        const result = await client.query(
            'UPDATE auth.usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = $1 RETURNING intentos_fallidos',
            [usuarioId]
        );

        const intentos = result.rows[0].intentos_fallidos;

        // Bloquear después de 5 intentos fallidos
        if (intentos >= 5) {
            const bloqueadoHasta = new Date(Date.now() + 30 * 60 * 1000); // 30 minutos
            await client.query(
                'UPDATE auth.usuarios SET bloqueado_hasta = $1 WHERE id = $2',
                [bloqueadoHasta, usuarioId]
            );
        }
    }

    /**
     * Generar access token y refresh token
     */
    generarTokens(usuario) {
        const accessTokenPayload = {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol,
            tipo: 'access'
        };

        const refreshTokenPayload = {
            id: usuario.id,
            email: usuario.email,
            tipo: 'refresh',
            jti: crypto.randomBytes(16).toString('hex') // JWT ID único
        };

        const accessToken = jwt.sign(
            accessTokenPayload,
            process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025',
            { expiresIn: process.env.JWT_EXPIRY || '1h' }
        );

        const refreshToken = jwt.sign(
            refreshTokenPayload,
            process.env.JWT_REFRESH_SECRET || 'ucb-admissions-refresh-secret-2025',
            { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: 3600 // 1 hora en segundos
        };
    }

    /**
     * Guardar refresh token en base de datos
     */
    async guardarRefreshToken(usuarioId, refreshToken) {
        const decoded = jwt.decode(refreshToken);
        const expiracion = new Date(decoded.exp * 1000);

        await pool.query(
            `INSERT INTO auth.refresh_tokens (usuario_id, token, jti, expira_en, fecha_creacion)
             VALUES ($1, $2, $3, $4, NOW())`,
            [usuarioId, refreshToken, decoded.jti, expiracion]
        );
    }

    /**
     * Registrar sesión de usuario
     */
    async registrarSesion(client, usuarioId, token) {
        const sessionId = crypto.randomBytes(32).toString('hex');

        await client.query(
            `INSERT INTO auth.sesiones (id, usuario_id, token, fecha_inicio, ultimo_ping, activa)
             VALUES ($1, $2, $3, NOW(), NOW(), true)`,
            [sessionId, usuarioId, token]
        );

        return sessionId;
    }

    /**
     * Refresh access token usando refresh token
     */
    async refreshAccessToken(refreshToken) {
        try {
            // Verificar refresh token
            const decoded = jwt.verify(
                refreshToken,
                process.env.JWT_REFRESH_SECRET || 'ucb-admissions-refresh-secret-2025'
            );

            // Verificar que el refresh token existe y está activo
            const result = await pool.query(
                `SELECT rt.*, u.email, u.rol, u.estado
                 FROM auth.refresh_tokens rt
                 INNER JOIN auth.usuarios u ON rt.usuario_id = u.id
                 WHERE rt.jti = $1 AND rt.revocado = false AND rt.expira_en > NOW()`,
                [decoded.jti]
            );

            if (result.rows.length === 0) {
                throw new Error('Refresh token inválido o revocado');
            }

            const tokenData = result.rows[0];

            if (tokenData.estado !== 'ACTIVO') {
                throw new Error('Usuario inactivo');
            }

            // Generar nuevo access token
            const newAccessToken = jwt.sign(
                {
                    id: decoded.id,
                    email: tokenData.email,
                    rol: tokenData.rol,
                    tipo: 'access'
                },
                process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025',
                { expiresIn: process.env.JWT_EXPIRY || '1h' }
            );

            return {
                accessToken: newAccessToken,
                expiresIn: 3600
            };

        } catch (error) {
            throw new Error('Token inválido o expirado');
        }
    }

    /**
     * Logout - revocar tokens
     */
    async logout(usuarioId, refreshToken) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Revocar refresh token
            if (refreshToken) {
                const decoded = jwt.decode(refreshToken);
                if (decoded && decoded.jti) {
                    await client.query(
                        'UPDATE auth.refresh_tokens SET revocado = true, fecha_revocacion = NOW() WHERE jti = $1',
                        [decoded.jti]
                    );
                }
            }

            // Cerrar sesiones activas
            await client.query(
                'UPDATE auth.sesiones SET activa = false, fecha_fin = NOW() WHERE usuario_id = $1 AND activa = true',
                [usuarioId]
            );

            await client.query('COMMIT');

            return { success: true, message: 'Logout exitoso' };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Verificar token de acceso
     */
    async verificarToken(token) {
        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || 'ucb-admissions-secret-key-2025'
            );

            // Verificar que el usuario existe y está activo
            const result = await pool.query(
                'SELECT id, email, rol, estado FROM auth.usuarios WHERE id = $1',
                [decoded.id]
            );

            if (result.rows.length === 0) {
                throw new Error('Usuario no encontrado');
            }

            const usuario = result.rows[0];

            if (usuario.estado !== 'ACTIVO') {
                throw new Error('Usuario inactivo');
            }

            return {
                valido: true,
                usuario: {
                    id: usuario.id,
                    email: usuario.email,
                    rol: usuario.rol
                }
            };

        } catch (error) {
            return {
                valido: false,
                error: error.message
            };
        }
    }

    /**
     * Cambiar contraseña
     */
    async cambiarPassword(usuarioId, passwordActual, passwordNuevo) {
        const client = await pool.connect();

        try {
            // Obtener usuario
            const result = await client.query(
                'SELECT password_hash FROM auth.usuarios WHERE id = $1',
                [usuarioId]
            );

            if (result.rows.length === 0) {
                throw new Error('Usuario no encontrado');
            }

            const usuario = result.rows[0];

            // Verificar password actual
            const passwordValido = await bcrypt.compare(passwordActual, usuario.password_hash);

            if (!passwordValido) {
                throw new Error('Contraseña actual incorrecta');
            }

            // Hash del nuevo password
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(passwordNuevo, salt);

            // Actualizar password
            await client.query(
                'UPDATE auth.usuarios SET password_hash = $1, fecha_actualizacion = NOW() WHERE id = $2',
                [hashedPassword, usuarioId]
            );

            // Revocar todos los refresh tokens del usuario
            await client.query(
                'UPDATE auth.refresh_tokens SET revocado = true, fecha_revocacion = NOW() WHERE usuario_id = $1 AND revocado = false',
                [usuarioId]
            );

            return { success: true, message: 'Contraseña actualizada exitosamente' };

        } finally {
            client.release();
        }
    }

    /**
     * Solicitar reset de password
     */
    async solicitarResetPassword(email) {
        const client = await pool.connect();

        try {
            // Buscar usuario
            const result = await client.query(
                'SELECT id, email, nombre_completo FROM auth.usuarios WHERE email = $1',
                [email]
            );

            if (result.rows.length === 0) {
                // No revelar si el email existe o no
                return { success: true, message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña' };
            }

            const usuario = result.rows[0];

            // Generar token de reset
            const resetToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
            const expiracion = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

            // Guardar token
            await client.query(
                `INSERT INTO auth.password_resets (usuario_id, token, expira_en, usado, fecha_creacion)
                 VALUES ($1, $2, $3, false, NOW())`,
                [usuario.id, hashedToken, expiracion]
            );

            // TODO: Enviar email con el token
            // await emailService.enviarResetPassword(usuario.email, resetToken);

            return {
                success: true,
                message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña',
                // En desarrollo, devolver el token
                ...(process.env.NODE_ENV === 'development' && { resetToken })
            };

        } finally {
            client.release();
        }
    }

    /**
     * Resetear password con token
     */
    async resetearPassword(token, nuevoPassword) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // Hash del token recibido
            const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

            // Buscar token válido
            const result = await client.query(
                `SELECT pr.usuario_id, pr.id as reset_id
                 FROM auth.password_resets pr
                 WHERE pr.token = $1 AND pr.usado = false AND pr.expira_en > NOW()`,
                [hashedToken]
            );

            if (result.rows.length === 0) {
                throw new Error('Token inválido o expirado');
            }

            const resetData = result.rows[0];

            // Hash del nuevo password
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(nuevoPassword, salt);

            // Actualizar password
            await client.query(
                'UPDATE auth.usuarios SET password_hash = $1, fecha_actualizacion = NOW() WHERE id = $2',
                [hashedPassword, resetData.usuario_id]
            );

            // Marcar token como usado
            await client.query(
                'UPDATE auth.password_resets SET usado = true, fecha_uso = NOW() WHERE id = $1',
                [resetData.reset_id]
            );

            // Revocar todos los refresh tokens
            await client.query(
                'UPDATE auth.refresh_tokens SET revocado = true, fecha_revocacion = NOW() WHERE usuario_id = $1 AND revocado = false',
                [resetData.usuario_id]
            );

            await client.query('COMMIT');

            return { success: true, message: 'Contraseña reseteada exitosamente' };

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Obtener perfil de usuario
     */
    async obtenerPerfil(usuarioId) {
        const result = await pool.query(
            `SELECT id, email, nombre_completo, ci, celular, rol, estado,
                    fecha_creacion, ultimo_acceso
             FROM auth.usuarios
             WHERE id = $1`,
            [usuarioId]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const user = result.rows[0];
        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            ci: user.ci,
            celular: user.celular,
            rol: user.rol,
            estado: user.estado,
            fechaCreacion: user.fecha_creacion,
            ultimoAcceso: user.ultimo_acceso
        };
    }

    /**
     * Actualizar perfil de usuario
     */
    async actualizarPerfil(usuarioId, datosActualizacion) {
        const { nombre_completo, celular } = datosActualizacion;

        const result = await pool.query(
            `UPDATE auth.usuarios
             SET nombre_completo = COALESCE($1, nombre_completo),
                 celular = COALESCE($2, celular),
                 fecha_actualizacion = NOW()
             WHERE id = $3
             RETURNING id, email, nombre_completo, ci, celular, rol`,
            [nombre_completo, celular, usuarioId]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const user = result.rows[0];
        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            ci: user.ci,
            celular: user.celular,
            rol: user.rol
        };
    }

    /**
     * Health check del servicio de autenticación
     */
    async healthCheck() {
        try {
            const result = await pool.query('SELECT COUNT(*) FROM auth.usuarios');
            return {
                status: 'healthy',
                service: 'AuthService',
                totalUsuarios: parseInt(result.rows[0].count),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                service: 'AuthService',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = new AuthService();