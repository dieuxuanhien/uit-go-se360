"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverApprovalStatus = exports.UserRole = void 0;
/**
 * User Role Enum
 * Defines the role of a user in the system
 */
var UserRole;
(function (UserRole) {
    UserRole["PASSENGER"] = "PASSENGER";
    UserRole["DRIVER"] = "DRIVER";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Driver Profile Approval Status
 */
var DriverApprovalStatus;
(function (DriverApprovalStatus) {
    DriverApprovalStatus["PENDING"] = "PENDING";
    DriverApprovalStatus["APPROVED"] = "APPROVED";
    DriverApprovalStatus["REJECTED"] = "REJECTED";
    DriverApprovalStatus["SUSPENDED"] = "SUSPENDED";
})(DriverApprovalStatus || (exports.DriverApprovalStatus = DriverApprovalStatus = {}));
//# sourceMappingURL=index.js.map