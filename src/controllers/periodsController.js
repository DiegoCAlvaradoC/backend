// controllers/periodsController.js
/**
 * Controlador para Gestión de Períodos de Inscripción
 * Trabaja con la tabla periodos_inscripcion
 */

const { pool } = require('../config/database');

class PeriodsController {

    /**
     * =============================================
     * GESTIÓN DE PERÍODOS DE INSCRIPCIÓN
     * =============================================
     */

    /**
     * Crear nuevo período de inscripción
     * POST /api/admin/periodos
     */
    async crearPeriodo(req, res) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            console.log('📅 Creando nuevo período...');
            console.log('Datos recibidos:', req.body);

            const {
                nombre,
                descripcion,
                fecha_inicio,
                fecha_fin,
                estado
            } = req.body;

            // Validar campos requeridos
            if (!nombre || !fecha_inicio || !fecha_fin) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'Campos requeridos: nombre, fecha_inicio, fecha_fin'
                });
            }

            // Validar fechas
            if (new Date(fecha_inicio) >= new Date(fecha_fin)) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'La fecha de inicio debe ser anterior a la fecha de fin'
                });
            }

            // Si se marca como activo (estado = true), desactivar otros períodos
            if (estado === true) {
                await client.query(
                    'UPDATE periodos_inscripcion SET estado = false WHERE estado = true'
                );
                console.log('🔄 Períodos anteriores desactivados');
            }

            // Insertar nuevo período
            const query = `
        INSERT INTO periodos_inscripcion 
        (nombre, descripcion, fecha_inicio, fecha_fin, estado, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `;

            const values = [
                nombre,
                descripcion || null,
                fecha_inicio,
                fecha_fin,
                estado !== undefined ? estado : true
            ];

            const result = await client.query(query, values);
            await client.query('COMMIT');

            const periodo = result.rows[0];

            console.log('✅ Período creado:', periodo.id_periodo);

            res.status(201).json({
                success: true,
                data: {
                    id_periodo: periodo.id_periodo,
                    nombre: periodo.nombre,
                    descripcion: periodo.descripcion,
                    fecha_inicio: periodo.fecha_inicio,
                    fecha_fin: periodo.fecha_fin,
                    estado: periodo.estado,
                    fecha_creacion: periodo.created_at,
                    carreras: [] // Siempre vacío ya que no está en la tabla
                },
                message: 'Período creado exitosamente'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error creando período:', error);

            res.status(500).json({
                success: false,
                error: 'Error al crear período',
                message: error.message
            });
        } finally {
            client.release();
        }
    }

    /**
     * Obtener todos los períodos
     * GET /api/admin/periodos
     */
    async obtenerPeriodos(req, res) {
        try {
            console.log('📋 Obteniendo todos los períodos...');

            const { estado, limit, offset } = req.query;

            let whereConditions = [];
            let params = [];
            let paramCount = 1;

            // Filtro por estado (activo/inactivo)
            if (estado !== undefined) {
                whereConditions.push(`estado = $${paramCount++}`);
                params.push(estado === 'true');
            }

            const whereClause = whereConditions.length > 0
                ? `WHERE ${whereConditions.join(' AND ')}`
                : '';

            // Límite y offset para paginación
            const limitValue = limit ? parseInt(limit) : 100;
            const offsetValue = offset ? parseInt(offset) : 0;

            params.push(limitValue, offsetValue);

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
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount++} OFFSET $${paramCount}
      `;

            const result = await pool.query(query, params);

            console.log(`✅ ${result.rows.length} períodos obtenidos`);

            // Transformar al formato esperado por el frontend
            const periodosFormateados = result.rows.map(p => ({
                id_periodo: p.id_periodo,
                nombre: p.nombre,
                descripcion: p.descripcion,
                fecha_inicio: p.fecha_inicio,
                fecha_fin: p.fecha_fin,
                estado: p.estado,
                fecha_creacion: p.created_at,
                carreras: [] // No se almacenan en esta tabla
            }));

            res.json({
                success: true,
                data: periodosFormateados
            });

        } catch (error) {
            console.error('❌ Error obteniendo períodos:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener períodos',
                message: error.message
            });
        }
    }

    /**
     * Obtener período por ID
     * GET /api/admin/periodos/:id
     */
    async obtenerPeriodoPorId(req, res) {
        try {
            const { id } = req.params;

            console.log('🔍 Obteniendo período:', id);

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
        WHERE id_periodo = $1
      `;

            const result = await pool.query(query, [id]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Período no encontrado'
                });
            }

            const periodo = result.rows[0];

            console.log('✅ Período encontrado:', periodo.nombre);

            res.json({
                success: true,
                data: {
                    id_periodo: periodo.id_periodo,
                    nombre: periodo.nombre,
                    descripcion: periodo.descripcion,
                    fecha_inicio: periodo.fecha_inicio,
                    fecha_fin: periodo.fecha_fin,
                    estado: periodo.estado,
                    fecha_creacion: periodo.created_at,
                    carreras: []
                }
            });

        } catch (error) {
            console.error('❌ Error obteniendo período:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener período',
                message: error.message
            });
        }
    }

    /**
     * Obtener período activo actual
     * GET /api/admin/periodos/activo/current
     */
    async obtenerPeriodoActivo(req, res) {
        try {
            console.log('🔍 Obteniendo período activo...');

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

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No hay período activo'
                });
            }

            const periodo = result.rows[0];

            console.log('✅ Período activo:', periodo.nombre);

            res.json({
                success: true,
                data: {
                    id_periodo: periodo.id_periodo,
                    nombre: periodo.nombre,
                    descripcion: periodo.descripcion,
                    fecha_inicio: periodo.fecha_inicio,
                    fecha_fin: periodo.fecha_fin,
                    estado: periodo.estado,
                    fecha_creacion: periodo.created_at,
                    carreras: []
                }
            });

        } catch (error) {
            console.error('❌ Error obteniendo período activo:', error);
            res.status(500).json({
                success: false,
                error: 'Error al obtener período activo',
                message: error.message
            });
        }
    }

    /**
     * Actualizar período
     * PATCH /api/admin/periodos/:id
     */
    async actualizarPeriodo(req, res) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { id } = req.params;
            const {
                nombre,
                descripcion,
                fecha_inicio,
                fecha_fin,
                estado
            } = req.body;

            console.log('✏️ Actualizando período:', id);
            console.log('Datos:', req.body);

            // Si se activa este período, desactivar otros
            if (estado === true) {
                await client.query(
                    'UPDATE periodos_inscripcion SET estado = false WHERE id_periodo != $1 AND estado = true',
                    [id]
                );
                console.log('🔄 Otros períodos desactivados');
            }

            // Construir query dinámicamente
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
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'No hay campos para actualizar'
                });
            }

            // Agregar updated_at y el ID
            updates.push(`updated_at = NOW()`);
            values.push(id);

            const query = `
        UPDATE periodos_inscripcion
        SET ${updates.join(', ')}
        WHERE id_periodo = $${paramCount}
        RETURNING *
      `;

            const result = await client.query(query, values);

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Período no encontrado'
                });
            }

            await client.query('COMMIT');

            const periodo = result.rows[0];

            console.log('✅ Período actualizado exitosamente');

            res.json({
                success: true,
                data: {
                    id_periodo: periodo.id_periodo,
                    nombre: periodo.nombre,
                    descripcion: periodo.descripcion,
                    fecha_inicio: periodo.fecha_inicio,
                    fecha_fin: periodo.fecha_fin,
                    estado: periodo.estado,
                    fecha_creacion: periodo.created_at,
                    carreras: []
                },
                message: 'Período actualizado exitosamente'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error actualizando período:', error);

            res.status(500).json({
                success: false,
                error: 'Error al actualizar período',
                message: error.message
            });
        } finally {
            client.release();
        }
    }

    /**
     * Eliminar período
     * DELETE /api/admin/periodos/:id
     */
    async eliminarPeriodo(req, res) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { id } = req.params;

            console.log('🗑️ Eliminando período:', id);

            // Verificar si tiene preinscripciones asociadas
            const checkQuery = `
        SELECT COUNT(*) as total
        FROM preinscripciones
        WHERE periodo_id = $1
      `;

            const checkResult = await client.query(checkQuery, [id]);
            const totalPreinscripciones = parseInt(checkResult.rows[0].total);

            if (totalPreinscripciones > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    error: 'No se puede eliminar un período con preinscripciones asociadas',
                    message: `Este período tiene ${totalPreinscripciones} preinscripciones`
                });
            }

            // Eliminar período (hard delete)
            const deleteQuery = `
        DELETE FROM periodos_inscripcion
        WHERE id_periodo = $1
        RETURNING *
      `;

            const result = await client.query(deleteQuery, [id]);

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Período no encontrado'
                });
            }

            await client.query('COMMIT');

            console.log('✅ Período eliminado exitosamente');

            res.json({
                success: true,
                message: 'Período eliminado exitosamente'
            });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('❌ Error eliminando período:', error);

            res.status(500).json({
                success: false,
                error: 'Error al eliminar período',
                message: error.message
            });
        } finally {
            client.release();
        }
    }

    /**
     * Health check del módulo de administración
     * GET /api/admin/health
     */
    async healthCheck(req, res) {
        try {
            const result = await pool.query(
                'SELECT COUNT(*) as total FROM periodos_inscripcion'
            );

            res.json({
                success: true,
                service: 'PeriodsController',
                status: 'healthy',
                totalPeriodos: parseInt(result.rows[0].total),
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                service: 'PeriodsController',
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
}

module.exports = new PeriodsController();