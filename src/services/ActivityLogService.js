const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const UserRoles = require('../models/UserRoles');
const { ForbiddenError, NotFoundError, UnauthorizedError } = require('../utils/errors');

class ActivityLogService {
  _requireAuth(currentUser) {
    if (!currentUser) {
      throw new UnauthorizedError('Non authentifié.');
    }
  }

  _requireRoles(currentUser, ...allowedRoles) {
    this._requireAuth(currentUser);
    if (!allowedRoles.includes(currentUser.role)) {
      throw new ForbiddenError('Accès refusé.');
    }
  }

  /**
   * Log an employee action. Safe to call, catches internal errors so it doesn't fail main request
   */
  async log(userId, parkingId, actionType, details) {
    try {
      if (!userId || !parkingId) return;
      const logEntry = new ActivityLog({
        userId,
        parkingId,
        actionType,
        details
      });
      await logEntry.save();
      console.log(`📝 [ActivityLog] ${actionType} recorded for user ${userId} on parking ${parkingId}`);
    } catch (error) {
      console.error('❌ Failed to save ActivityLog:', error);
    }
  }

  /**
   * Get activity logs for a specific employee
   */
  async getEmployeeLogs(employeeId, currentUser, query = {}) {
    this._requireRoles(currentUser, UserRoles.COMPANY, UserRoles.SUPER_ADMIN);

    const employee = await User.findById(employeeId);
    if (!employee || employee.role !== UserRoles.EMPLOYEE) {
      throw new NotFoundError('Employé non trouvé.');
    }

    // Access control
    if (currentUser.role === UserRoles.COMPANY && employee.companyId?.toString() !== currentUser.id) {
      throw new ForbiddenError('Accès refusé. Cet employé n\'appartient pas à votre entreprise.');
    }

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ActivityLog.find({ userId: employeeId })
        .populate('userId', 'name email position')
        .populate('parkingId', 'name city')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit),
      ActivityLog.countDocuments({ userId: employeeId })
    ]);

    return {
      success: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }
}

module.exports = new ActivityLogService();
