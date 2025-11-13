// /controllers/adminController.js

const adminService = require('../services/adminService');

class AdminController {

  /**
   * POST /api/admin/periodos
   * Crear nuevo período académico
   */
  async crearPeriodo(req, res) {
    try {
      const periodo = await adminService.crearPeriodo(req.body);
      
      res.status(201).json({
        success: true,
        data: periodo,
        message: 'Período académico creado exitosamente'
      });

    } catch (error) {
      console.error('Error creando período:', error);
      res.status(500).json({
        success: false,
        error: 'Error creando período',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/periodos
   * Obtener todos los períodos
   */
  async obtenerPeriodos(req, res) {
    try {
      const filtros = {
        activo: req.query.activo === 'true' ? true : req.query.activo === 'false' ? false : undefined,
        gestion: req.query.gestion,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0
      };

      const resultado = await adminService.obtenerPeriodos(filtros);
      
      res.json({
        success: true,
        data: resultado.periodos,
        pagination: {
          total: resultado.total,
          limit: resultado.limit,
          offset: resultado.offset
        }
      });

    } catch (error) {
      console.error('Error obteniendo períodos:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo períodos',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/periodos/:id
   * Obtener período por ID
   */
  async obtenerPeriodoPorId(req, res) {
    try {
      const periodo = await adminService.obtenerPeriodoPorId(req.params.id);
      
      res.json({
        success: true,
        data: periodo
      });

    } catch (error) {
      console.error('Error obteniendo período:', error);
      res.status(error.message === 'Período no encontrado' ? 404 : 500).json({
        success: false,
        error: 'Error obteniendo período',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/periodos/activo/current
   * Obtener período activo
   */
  async obtenerPeriodoActivo(req, res) {
    try {
      const periodo = await adminService.obtenerPeriodoActivo();
      
      if (!periodo) {
        return res.status(404).json({
          success: false,
          error: 'No hay período activo',
          message: 'No se encontró ningún período académico activo'
        });
      }

      res.json({
        success: true,
        data: periodo
      });

    } catch (error) {
      console.error('Error obteniendo período activo:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo período activo',
        message: error.message
      });
    }
  }

  /**
   * PATCH /api/admin/periodos/:id
   * Actualizar período
   */
  async actualizarPeriodo(req, res) {
    try {
      const periodo = await adminService.actualizarPeriodo(req.params.id, req.body);
      
      res.json({
        success: true,
        data: periodo,
        message: 'Período actualizado exitosamente'
      });

    } catch (error) {
      console.error('Error actualizando período:', error);
      res.status(500).json({
        success: false,
        error: 'Error actualizando período',
        message: error.message
      });
    }
  }

  /**
   * DELETE /api/admin/periodos/:id
   * Eliminar período
   */
  async eliminarPeriodo(req, res) {
    try {
      const resultado = await adminService.eliminarPeriodo(req.params.id);
      
      res.json({
        success: true,
        ...resultado
      });

    } catch (error) {
      console.error('Error eliminando período:', error);
      res.status(500).json({
        success: false,
        error: 'Error eliminando período',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/usuarios
   * Listar usuarios
   */
  async listarUsuarios(req, res) {
    try {
      const filtros = {
        rol: req.query.rol,
        estado: req.query.estado,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0
      };

      const usuarios = await adminService.listarUsuarios(filtros);
      
      res.json({
        success: true,
        data: usuarios
      });

    } catch (error) {
      console.error('Error listando usuarios:', error);
      res.status(500).json({
        success: false,
        error: 'Error listando usuarios',
        message: error.message
      });
    }
  }

  /**
   * POST /api/admin/usuarios
   * Crear usuario administrativo
   */
  async crearUsuarioAdmin(req, res) {
    try {
      const usuario = await adminService.crearUsuarioAdmin(req.body);
      
      res.status(201).json({
        success: true,
        data: usuario,
        message: 'Usuario creado exitosamente'
      });

    } catch (error) {
      console.error('Error creando usuario:', error);
      res.status(500).json({
        success: false,
        error: 'Error creando usuario',
        message: error.message
      });
    }
  }

  /**
   * PATCH /api/admin/usuarios/:id/rol
   * Actualizar rol de usuario
   */
  async actualizarRol(req, res) {
    try {
      const { rol } = req.body;

      if (!rol) {
        return res.status(400).json({
          success: false,
          error: 'Rol requerido',
          message: 'Se debe especificar el nuevo rol'
        });
      }

      const usuario = await adminService.actualizarRolUsuario(req.params.id, rol);
      
      res.json({
        success: true,
        data: usuario,
        message: 'Rol actualizado exitosamente'
      });

    } catch (error) {
      console.error('Error actualizando rol:', error);
      res.status(500).json({
        success: false,
        error: 'Error actualizando rol',
        message: error.message
      });
    }
  }

  /**
   * PATCH /api/admin/usuarios/:id/estado
   * Cambiar estado de usuario
   */
  async cambiarEstado(req, res) {
    try {
      const { estado } = req.body;

      if (!estado) {
        return res.status(400).json({
          success: false,
          error: 'Estado requerido',
          message: 'Se debe especificar el nuevo estado'
        });
      }

      const usuario = await adminService.cambiarEstadoUsuario(req.params.id, estado);
      
      res.json({
        success: true,
        data: usuario,
        message: 'Estado actualizado exitosamente'
      });

    } catch (error) {
      console.error('Error cambiando estado:', error);
      res.status(500).json({
        success: false,
        error: 'Error cambiando estado',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/logs
   * Obtener logs de auditoría
   */
  async obtenerLogs(req, res) {
    try {
      const filtros = {
        usuario_id: req.query.usuario_id,
        accion: req.query.accion,
        fecha_desde: req.query.fecha_desde,
        fecha_hasta: req.query.fecha_hasta,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const logs = await adminService.obtenerLogsAuditoria(filtros);
      
      res.json({
        success: true,
        data: logs
      });

    } catch (error) {
      console.error('Error obteniendo logs:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo logs',
        message: error.message
      });
    }
  }

  /**
   * GET /api/admin/health
   * Health check
   */
  async healthCheck(req, res) {
    try {
      const health = await adminService.healthCheck();
      
      res.json({
        success: true,
        ...health
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();