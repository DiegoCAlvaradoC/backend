// services/adminUsuariosService.js
const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * Servicio de Administración de Usuarios
 * Solo para usuarios con rol ADMINISTRADOR
 */
class AdminUsuariosService {

    /**
     * Obtener todos los usuarios con filtros y paginación
     */
    async obtenerUsuarios(filtros) {
        const {
            pagina = 1,
            limite = 20,
            rol,
            estado,
            busqueda
        } = filtros;

        const offset = (pagina - 1) * limite;

        let query = `
            SELECT 
                id,
                email,
                nombre_completo,
                ci,
                celular,
                rol,
                estado,
                email_verificado,
                intentos_fallidos,
                bloqueado_hasta,
                fecha_creacion,
                ultimo_acceso
            FROM auth.usuarios
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Filtro por rol
        if (rol && ['ESTUDIANTE', 'ADMINISTRATIVO', 'ADMINISTRADOR'].includes(rol)) {
            query += ` AND rol = $${paramIndex}`;
            params.push(rol);
            paramIndex++;
        }

        // Filtro por estado
        if (estado && ['ACTIVO', 'INACTIVO', 'BLOQUEADO'].includes(estado)) {
            query += ` AND estado = $${paramIndex}`;
            params.push(estado);
            paramIndex++;
        }

        // Búsqueda por nombre o email
        if (busqueda && busqueda.trim()) {
            query += ` AND (
                LOWER(nombre_completo) LIKE LOWER($${paramIndex}) OR 
                LOWER(email) LIKE LOWER($${paramIndex})
            )`;
            params.push(`%${busqueda.trim()}%`);
            paramIndex++;
        }

        // Ordenar por fecha de creación (más recientes primero)
        query += ` ORDER BY fecha_creacion DESC`;

        // Paginación
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limite, offset);

        // Ejecutar query
        const result = await pool.query(query, params);

        // Contar total de usuarios (sin paginación)
        let countQuery = `SELECT COUNT(*) FROM auth.usuarios WHERE 1=1`;
        const countParams = [];
        let countParamIndex = 1;

        if (rol && ['ESTUDIANTE', 'ADMINISTRATIVO', 'ADMINISTRADOR'].includes(rol)) {
            countQuery += ` AND rol = $${countParamIndex}`;
            countParams.push(rol);
            countParamIndex++;
        }

        if (estado && ['ACTIVO', 'INACTIVO', 'BLOQUEADO'].includes(estado)) {
            countQuery += ` AND estado = $${countParamIndex}`;
            countParams.push(estado);
            countParamIndex++;
        }

        if (busqueda && busqueda.trim()) {
            countQuery += ` AND (
                LOWER(nombre_completo) LIKE LOWER($${countParamIndex}) OR 
                LOWER(email) LIKE LOWER($${countParamIndex})
            )`;
            countParams.push(`%${busqueda.trim()}%`);
        }

        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        // Transformar resultados a camelCase
        const usuarios = result.rows.map(user => ({
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            ci: user.ci,
            celular: user.celular,
            rol: user.rol,
            estado: user.estado,
            emailVerificado: user.email_verificado,
            intentosFallidos: user.intentos_fallidos,
            bloqueadoHasta: user.bloqueado_hasta,
            fechaCreacion: user.fecha_creacion,
            ultimoAcceso: user.ultimo_acceso
        }));

        return {
            usuarios,
            total,
            pagina,
            totalPaginas: Math.ceil(total / limite)
        };
    }

    /**
     * Obtener un usuario por ID
     */
    async obtenerUsuarioPorId(id) {
        const result = await pool.query(
            `SELECT 
                id, email, nombre_completo, ci, celular,
                rol, estado, email_verificado,
                intentos_fallidos, bloqueado_hasta,
                fecha_creacion, ultimo_acceso
            FROM auth.usuarios
            WHERE id = $1`,
            [id]
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
            emailVerificado: user.email_verificado,
            intentosFallidos: user.intentos_fallidos,
            bloqueadoHasta: user.bloqueado_hasta,
            fechaCreacion: user.fecha_creacion,
            ultimoAcceso: user.ultimo_acceso
        };
    }

    /**
     * Crear un nuevo usuario
     */
    async crearUsuario(userData) {
        const {
            email,
            password,
            nombre_completo,
            ci,
            celular,
            rol = 'ESTUDIANTE'
        } = userData;

        // Verificar si el email ya existe
        const emailExists = await pool.query(
            'SELECT id FROM auth.usuarios WHERE email = $1',
            [email]
        );

        if (emailExists.rows.length > 0) {
            throw new Error('El email ya está registrado');
        }

        // Verificar si el CI ya existe (si se proporciona)
        if (ci) {
            const ciExists = await pool.query(
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
        const result = await pool.query(
            `INSERT INTO auth.usuarios (
                email, password_hash, nombre_completo, ci, celular,
                rol, estado, email_verificado,
                fecha_creacion, ultimo_acceso
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', true, NOW(), NOW())
            RETURNING id, email, nombre_completo, ci, celular, rol, estado`,
            [email, hashedPassword, nombre_completo, ci, celular, rol]
        );

        const user = result.rows[0];

        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            ci: user.ci,
            celular: user.celular,
            rol: user.rol,
            estado: user.estado
        };
    }

    /**
     * Actualizar datos de un usuario
     */
    async actualizarUsuario(id, updates) {
        const {
            nombre_completo,
            ci,
            celular,
            estado
        } = updates;

        // Verificar que el usuario existe
        const userExists = await pool.query(
            'SELECT id FROM auth.usuarios WHERE id = $1',
            [id]
        );

        if (userExists.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        // Construir query dinámica
        const campos = [];
        const valores = [];
        let paramIndex = 1;

        if (nombre_completo !== undefined) {
            campos.push(`nombre_completo = $${paramIndex}`);
            valores.push(nombre_completo);
            paramIndex++;
        }

        if (ci !== undefined) {
            campos.push(`ci = $${paramIndex}`);
            valores.push(ci);
            paramIndex++;
        }

        if (celular !== undefined) {
            campos.push(`celular = $${paramIndex}`);
            valores.push(celular);
            paramIndex++;
        }

        if (estado !== undefined) {
            campos.push(`estado = $${paramIndex}`);
            valores.push(estado);
            paramIndex++;
        }

        if (campos.length === 0) {
            throw new Error('No hay campos para actualizar');
        }

        // Agregar fecha de actualización
        campos.push(`fecha_actualizacion = NOW()`);
        valores.push(id);

        const query = `
            UPDATE auth.usuarios
            SET ${campos.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING id, email, nombre_completo, ci, celular, rol, estado
        `;

        const result = await pool.query(query, valores);
        const user = result.rows[0];

        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            ci: user.ci,
            celular: user.celular,
            rol: user.rol,
            estado: user.estado
        };
    }

    /**
     * Cambiar rol de un usuario
     */
    async cambiarRol(id, nuevoRol) {
        const result = await pool.query(
            `UPDATE auth.usuarios
            SET rol = $1, fecha_actualizacion = NOW()
            WHERE id = $2
            RETURNING id, email, nombre_completo, rol, estado`,
            [nuevoRol, id]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const user = result.rows[0];

        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            rol: user.rol,
            estado: user.estado
        };
    }

    /**
     * Cambiar estado de un usuario
     */
    async cambiarEstado(id, nuevoEstado) {
        const result = await pool.query(
            `UPDATE auth.usuarios
            SET estado = $1, fecha_actualizacion = NOW()
            WHERE id = $2
            RETURNING id, email, nombre_completo, rol, estado`,
            [nuevoEstado, id]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const user = result.rows[0];

        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            rol: user.rol,
            estado: user.estado
        };
    }

    /**
     * Desbloquear usuario (resetear intentos fallidos)
     */
    async desbloquearUsuario(id) {
        const result = await pool.query(
            `UPDATE auth.usuarios
            SET intentos_fallidos = 0,
                bloqueado_hasta = NULL,
                fecha_actualizacion = NOW()
            WHERE id = $1
            RETURNING id, email, nombre_completo, rol, estado, intentos_fallidos`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        const user = result.rows[0];

        return {
            id: user.id,
            email: user.email,
            nombreCompleto: user.nombre_completo,
            rol: user.rol,
            estado: user.estado,
            intentosFallidos: user.intentos_fallidos
        };
    }

    /**
     * Resetear contraseña de un usuario
     */
    async resetearPassword(id, nuevaPassword) {
        // Verificar que el usuario existe
        const userExists = await pool.query(
            'SELECT id FROM auth.usuarios WHERE id = $1',
            [id]
        );

        if (userExists.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        // Hash del nuevo password
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(nuevaPassword, salt);

        // Actualizar password
        await pool.query(
            `UPDATE auth.usuarios
            SET password_hash = $1,
                intentos_fallidos = 0,
                bloqueado_hasta = NULL,
                fecha_actualizacion = NOW()
            WHERE id = $2`,
            [hashedPassword, id]
        );

        // Revocar todos los refresh tokens del usuario
        await pool.query(
            `UPDATE auth.refresh_tokens
            SET revocado = true, fecha_revocacion = NOW()
            WHERE usuario_id = $1 AND revocado = false`,
            [id]
        );

        return { success: true };
    }

    /**
     * Eliminar usuario (cambiar estado a INACTIVO)
     */
    async eliminarUsuario(id) {
        const result = await pool.query(
            `UPDATE auth.usuarios
            SET estado = 'INACTIVO', fecha_actualizacion = NOW()
            WHERE id = $1
            RETURNING id`,
            [id]
        );

        if (result.rows.length === 0) {
            throw new Error('Usuario no encontrado');
        }

        // Revocar todos los refresh tokens
        await pool.query(
            `UPDATE auth.refresh_tokens
            SET revocado = true, fecha_revocacion = NOW()
            WHERE usuario_id = $1 AND revocado = false`,
            [id]
        );

        return { success: true };
    }

    /**
     * Obtener estadísticas de usuarios
     */
    async obtenerEstadisticas() {
        // Total de usuarios
        const totalResult = await pool.query(
            'SELECT COUNT(*) FROM auth.usuarios'
        );
        const total = parseInt(totalResult.rows[0].count);

        // Por rol
        const rolResult = await pool.query(
            `SELECT rol, COUNT(*) as cantidad
            FROM auth.usuarios
            GROUP BY rol`
        );
        const porRol = {};
        rolResult.rows.forEach(row => {
            porRol[row.rol] = parseInt(row.cantidad);
        });

        // Por estado
        const estadoResult = await pool.query(
            `SELECT estado, COUNT(*) as cantidad
            FROM auth.usuarios
            GROUP BY estado`
        );
        const porEstado = {};
        estadoResult.rows.forEach(row => {
            porEstado[row.estado] = parseInt(row.cantidad);
        });

        // Nuevos usuarios últimos 30 días
        const nuevosResult = await pool.query(
            `SELECT COUNT(*) FROM auth.usuarios
            WHERE fecha_creacion >= NOW() - INTERVAL '30 days'`
        );
        const nuevosUltimos30Dias = parseInt(nuevosResult.rows[0].count);

        return {
            total,
            porRol,
            porEstado,
            nuevosUltimos30Dias
        };
    }
}

module.exports = new AdminUsuariosService();