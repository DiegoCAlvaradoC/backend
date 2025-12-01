
// services/adminService.js

const { pool } = require('../config/database');
const bcrypt = require('bcrypt');
class AdminService {

/**
   * GESTIÓN DE PERÍODOS ACADÉMICOS
   */

  /**
   * Crear período académico
   */
  async crearPeriodo(dataPeriodo) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        estado = true
      } = dataPeriodo;

      // Validar fechas
      if (new Date(fecha_inicio) >= new Date(fecha_fin)) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
      }

      // Si se marca como activo, desactivar otros períodos activos
      if (estado) {
        await client.query(
          'UPDATE periodos_inscripcion SET estado = false WHERE estado = true'
        );
      }

      const query = `
        INSERT INTO periodos_inscripcion 
        (nombre, descripcion, fecha_inicio, fecha_fin, estado, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;

      const result = await client.query(query, [
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        estado
      ]);

      await client.query('COMMIT');

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener todos los períodos
   */
  async obtenerPeriodos(filtros = {}) {
    try {
      const { estado, limit = 20, offset = 0 } = filtros;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (estado !== undefined) {
        whereConditions.push(`pi.estado = $${paramCount++}`);
        params.push(estado);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';

      params.push(limit, offset);

      const query = `
        SELECT 
          pi.id_periodo,
          pi.nombre,
          pi.descripcion,
          pi.fecha_inicio,
          pi.fecha_fin,
          pi.estado,
          pi.created_at,
          pi.updated_at,
          COUNT(p.id_preinscripcion) as total_preinscripciones,
          COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas
        FROM periodos_inscripcion pi
        LEFT JOIN preinscripciones p ON pi.id_periodo = p.periodo_id
        ${whereClause}
        GROUP BY pi.id_periodo, pi.nombre, pi.descripcion, pi.fecha_inicio, pi.fecha_fin, pi.estado, pi.created_at, pi.updated_at
        ORDER BY pi.fecha_inicio DESC
        LIMIT $${paramCount++} OFFSET $${paramCount}
      `;

      const result = await pool.query(query, params);

      // Obtener total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM periodos_inscripcion pi
        ${whereClause}
      `;

      const countResult = await pool.query(countQuery, params.slice(0, params.length - 2));

      return {
        periodos: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };

    } catch (error) {
      console.error('Error obteniendo períodos:', error);
      throw error;
    }
  }

  /**
   * Obtener período por ID
   */
  async obtenerPeriodoPorId(periodoId) {
    try {
      const query = `
        SELECT 
          pi.id_periodo,
          pi.nombre,
          pi.descripcion,
          pi.fecha_inicio,
          pi.fecha_fin,
          pi.estado,
          pi.created_at,
          pi.updated_at,
          COUNT(p.id_preinscripcion) as total_preinscripciones,
          COUNT(CASE WHEN p.estado = 'PENDIENTE' THEN 1 END) as pendientes,
          COUNT(CASE WHEN p.estado = 'EN_REVISION' THEN 1 END) as en_revision,
          COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas,
          COUNT(CASE WHEN p.estado = 'RECHAZADA' THEN 1 END) as rechazadas
        FROM periodos_inscripcion pi
        LEFT JOIN preinscripciones p ON pi.id_periodo = p.periodo_id
        WHERE pi.id_periodo = $1
        GROUP BY pi.id_periodo, pi.nombre, pi.descripcion, pi.fecha_inicio, pi.fecha_fin, pi.estado, pi.created_at, pi.updated_at
      `;

      const result = await pool.query(query, [periodoId]);

      if (result.rows.length === 0) {
        throw new Error('Período no encontrado');
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error obteniendo período:', error);
      throw error;
    }
  }

  /**
   * Obtener período activo
   */
  async obtenerPeriodoActivo() {
    try {
      const query = `
        SELECT 
          id_periodo,
          nombre,
          descripcion,
          fecha_inicio,
          fecha_fin,
          estado,
          created_at,
          updated_at
        FROM periodos_inscripcion
        WHERE estado = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await pool.query(query);

      return result.rows[0] || null;

    } catch (error) {
      console.error('Error obteniendo período activo:', error);
      throw error;
    }
  }

  /**
   * Actualizar período
   */
  async actualizarPeriodo(periodoId, datosActualizacion) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        nombre,
        descripcion,
        fecha_inicio,
        fecha_fin,
        estado
      } = datosActualizacion;

      // Si se activa este período, desactivar otros
      if (estado === true) {
        await client.query(
          'UPDATE periodos_inscripcion SET estado = false WHERE id_periodo != $1',
          [periodoId]
        );
      }

      const updates = [];
      const values = [];
      let paramCount = 1;

      if (nombre !== undefined) {
        updates.push(`nombre = $${paramCount++}`);
        values.push(nombre);
      }
      if (descripcion !== undefined) {
        updates.push(`descripcion = $${paramCount++}`);
        values.push(descripcion);
      }
      if (fecha_inicio !== undefined) {
        updates.push(`fecha_inicio = $${paramCount++}`);
        values.push(fecha_inicio);
      }
      if (fecha_fin !== undefined) {
        updates.push(`fecha_fin = $${paramCount++}`);
        values.push(fecha_fin);
      }
      if (estado !== undefined) {
        updates.push(`estado = $${paramCount++}`);
        values.push(estado);
      }

      if (updates.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(periodoId);

      const query = `
        UPDATE periodos_inscripcion
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id_periodo = $${paramCount}
        RETURNING *
      `;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        throw new Error('Período no encontrado');
      }

      await client.query('COMMIT');

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Eliminar período (soft delete)
   */
  async eliminarPeriodo(periodoId) {
    try {
      // Verificar que no tenga preinscripciones
      const checkQuery = `
        SELECT COUNT(*) as total
        FROM preinscripciones
        WHERE periodo_id = $1
      `;

      const checkResult = await pool.query(checkQuery, [periodoId]);

      if (parseInt(checkResult.rows[0].total) > 0) {
        throw new Error('No se puede eliminar un período con preinscripciones asociadas');
      }

      const query = `
        DELETE FROM periodos_inscripcion
        WHERE id_periodo = $1
        RETURNING *
      `;

      const result = await pool.query(query, [periodoId]);

      if (result.rows.length === 0) {
        throw new Error('Período no encontrado');
      }

      return { success: true, message: 'Período eliminado exitosamente' };

    } catch (error) {
      console.error('Error eliminando período:', error);
      throw error;
    }
  }
  /**
   * GESTIÓN DE USUARIOS
   */

  /**
   * Listar usuarios
   */
  async listarUsuarios(filtros = {}) {
    try {
      const { rol, estado, limit = 20, offset = 0 } = filtros;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (rol) {
        whereConditions.push(`rol = $${paramCount++}`);
        params.push(rol);
      }

      if (estado) {
        whereConditions.push(`estado = $${paramCount++}`);
        params.push(estado);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';

      params.push(limit, offset);

      const query = `
        SELECT 
          id, email, nombre_completo, ci, celular, rol, estado,
          fecha_creacion, ultimo_acceso
        FROM auth.usuarios
        ${whereClause}
        ORDER BY fecha_creacion DESC
        LIMIT $${paramCount++} OFFSET $${paramCount}
      `;

      const result = await pool.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('Error listando usuarios:', error);
      throw error;
    }
  }

  /**
   * Crear usuario administrativo
   */
  async crearUsuarioAdmin(datosUsuario) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        email,
        password,
        nombre_completo,
        ci,
        celular,
        rol = 'OPERADOR_ADMISIONES'
      } = datosUsuario;

      // Verificar email único
      const checkEmail = await client.query(
        'SELECT id FROM auth.usuarios WHERE email = $1',
        [email]
      );

      if (checkEmail.rows.length > 0) {
        throw new Error('El email ya está registrado');
      }

      // Hash password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      const query = `
        INSERT INTO auth.usuarios 
        (email, password_hash, nombre_completo, ci, celular, rol, estado, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', NOW())
        RETURNING id, email, nombre_completo, ci, celular, rol, estado
      `;

      const result = await client.query(query, [
        email,
        hashedPassword,
        nombre_completo,
        ci,
        celular,
        rol
      ]);

      await client.query('COMMIT');

      return result.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Actualizar rol de usuario
   */
  async actualizarRolUsuario(usuarioId, nuevoRol) {
    try {
      const query = `
        UPDATE auth.usuarios
        SET rol = $1, fecha_actualizacion = NOW()
        WHERE id = $2
        RETURNING id, email, nombre_completo, rol
      `;

      const result = await pool.query(query, [nuevoRol, usuarioId]);

      if (result.rows.length === 0) {
        throw new Error('Usuario no encontrado');
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error actualizando rol:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado de usuario
   */
  async cambiarEstadoUsuario(usuarioId, nuevoEstado) {
    try {
      const query = `
        UPDATE auth.usuarios
        SET estado = $1, fecha_actualizacion = NOW()
        WHERE id = $2
        RETURNING id, email, nombre_completo, estado
      `;

      const result = await pool.query(query, [nuevoEstado, usuarioId]);

      if (result.rows.length === 0) {
        throw new Error('Usuario no encontrado');
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error cambiando estado:', error);
      throw error;
    }
  }

  /**
   * LOGS Y AUDITORÍA
   */

  /**
   * Obtener logs de auditoría
   */
  async obtenerLogsAuditoria(filtros = {}) {
    try {
      const { usuario_id, accion, fecha_desde, fecha_hasta, limit = 50, offset = 0 } = filtros;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (usuario_id) {
        whereConditions.push(`usuario_id = $${paramCount++}`);
        params.push(usuario_id);
      }

      if (accion) {
        whereConditions.push(`accion = $${paramCount++}`);
        params.push(accion);
      }

      if (fecha_desde) {
        whereConditions.push(`fecha_accion >= $${paramCount++}`);
        params.push(fecha_desde);
      }

      if (fecha_hasta) {
        whereConditions.push(`fecha_accion <= $${paramCount++}`);
        params.push(fecha_hasta);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';

      params.push(limit, offset);

      const query = `
        SELECT 
          l.*,
          u.email as usuario_email,
          u.nombre_completo
        FROM admisiones.logs_auditoria l
        LEFT JOIN auth.usuarios u ON l.usuario_id = u.id
        ${whereClause}
        ORDER BY l.fecha_accion DESC
        LIMIT $${paramCount++} OFFSET $${paramCount}
      `;

      const result = await pool.query(query, params);

      return result.rows;

    } catch (error) {
      console.error('Error obteniendo logs:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const usuarios = await pool.query('SELECT COUNT(*) FROM auth.usuarios');
      const periodos = await pool.query('SELECT COUNT(*) FROM admisiones.periodos_inscripcion');

      return {
        status: 'healthy',
        service: 'AdminService',
        totalUsuarios: parseInt(usuarios.rows[0].count),
        totalPeriodos: parseInt(periodos.rows[0].count),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'AdminService',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new AdminService();