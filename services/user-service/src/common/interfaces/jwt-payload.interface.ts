/**
 * JWT Payload Interface
 * Structure of the decoded JWT token attached to request.user
 */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}
