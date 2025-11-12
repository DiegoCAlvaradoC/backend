// services/adminService.js

const pool = require('../config/database');
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
        gestion,
        fecha_inicio,
        fecha_fin,
        cupo_maximo,
        activo = true,
        observaciones
      } = dataPeriodo;

      // Validar fechas
      if (new Date(fecha_inicio) >= new Date(fecha_fin)) {
        throw new Error('La fecha de inicio debe ser anterior a la fecha de fin');
      }

      // Si se marca como activo, desactivar otros períodos activos
      if (activo) {
        await client.query(
          'UPDATE admisiones.periodos_academicos SET activo = false WHERE activo = true'
        );
      }

      const query = `
        INSERT INTO admisiones.periodos_academicos 
        (nombre, gestion, fecha_inicio, fecha_fin, cupo_maximo, activo, observaciones, fecha_creacion)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `;

      const result = await client.query(query, [
        nombre,
        gestion,
        fecha_inicio,
        fecha_fin,
        cupo_maximo,
        activo,
        observaciones
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
      const { activo, gestion, limit = 20, offset = 0 } = filtros;

      let whereConditions = [];
      let params = [];
      let paramCount = 1;

      if (activo !== undefined) {
        whereConditions.push(`activo = $${paramCount++}`);
        params.push(activo);
      }

      if (gestion) {
        whereConditions.push(`gestion = $${paramCount++}`);
        params.push(gestion);
      }

      const whereClause = whereConditions.length > 0 
        ? `WHERE ${whereConditions.join(' AND ')}` 
        : '';

      params.push(limit, offset);

      const query = `
        SELECT 
          pa.*,
          COUNT(p.id) as total_preinscripciones,
          COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas
        FROM admisiones.periodos_academicos pa
        LEFT JOIN admisiones.preinscripciones p ON pa.id = p.periodo_id
        ${whereClause}
        GROUP BY pa.id
        ORDER BY pa.fecha_inicio DESC
        LIMIT $${paramCount++} OFFSET $${paramCount}
      `;

      const result = await pool.query(query, params);

      // Obtener total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM admisiones.periodos_academicos
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
          pa.*,
          COUNT(p.id) as total_preinscripciones,
          COUNT(CASE WHEN p.estado = 'PENDIENTE' THEN 1 END) as pendientes,
          COUNT(CASE WHEN p.estado = 'EN_REVISION' THEN 1 END) as en_revision,
          COUNT(CASE WHEN p.estado = 'APROBADA' THEN 1 END) as aprobadas,
          COUNT(CASE WHEN p.estado = 'RECHAZADA' THEN 1 END) as rechazadas
        FROM admisiones.periodos_academicos pa
        LEFT JOIN admisiones.preinscripciones p ON pa.id = p.periodo_id
        WHERE pa.id = $1
        GROUP BY pa.id
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
        SELECT * FROM admisiones.periodos_academicos
        WHERE activo = true
        ORDER BY fecha_creacion DESC
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
        gestion,
        fecha_inicio,
        fecha_fin,
        cupo_maximo,
        activo,
        observaciones
      } = datosActualizacion;

      // Si se activa este período, desactivar otros
      if (activo === true) {
        await client.query(
          'UPDATE admisiones.periodos_academicos SET activo = false WHERE id != $1',
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
      if (gestion !== undefined) {
        updates.push(`gestion = $${paramCount++}`);
        values.push(gestion);
      }
      if (fecha_inicio !== undefined) {
        updates.push(`fecha_inicio = $${paramCount++}`);
        values.push(fecha_inicio);
      }
      if (fecha_fin !== undefined) {
        updates.push(`fecha_fin = $${paramCount++}`);
        values.push(fecha_fin);
      }
      if (cupo_maximo !== undefined) {
        updates.push(`cupo_maximo = $${paramCount++}`);
        values.push(cupo_maximo);
      }
      if (activo !== undefined) {
        updates.push(`activo = $${paramCount++}`);
        values.push(activo);
      }
      if (observaciones !== undefined) {
        updates.push(`observaciones = $${paramCount++}`);
        values.push(observaciones);
      }

      if (updates.length === 0) {
        throw new Error('No hay campos para actualizar');
      }

      values.push(periodoId);

      const query = `
        UPDATE admisiones.periodos_academicos
        SET ${updates.join(', ')}, fecha_actualizacion = NOW()
        WHERE id = $${paramCount}
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
        FROM admisiones.preinscripciones
        WHERE periodo_id = $1
      `;

      const checkResult = await pool.query(checkQuery, [periodoId]);

      if (parseInt(checkResult.rows[0].total) > 0) {
        throw new Error('No se puede eliminar un período con preinscripciones asociadas');
      }

      const query = `
        UPDATE admisiones.periodos_academicos
        SET activo = false, deleted_at = NOW()
        WHERE id = $1
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
      const periodos = await pool.query('SELECT COUNT(*) FROM admisiones.periodos_academicos');

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