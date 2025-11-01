# UIT-Go User Service

NestJS-based microservice handling user authentication, registration, and driver profile management for the UIT-Go ride-sharing platform.

## Features

- User registration and authentication (JWT-based)
- Role-based access control (PASSENGER/DRIVER)
- Driver profile management with vehicle information
- PostgreSQL database with Prisma ORM
- Comprehensive test coverage (unit + integration tests)

## API Endpoints

### Authentication

#### POST /users/register

Register a new user account.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "role": "DRIVER",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890"
}
```

**Response:** `201 Created`

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "DRIVER",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "createdAt": "2025-10-26T10:00:00.000Z",
    "updatedAt": "2025-10-26T10:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /users/login

Authenticate an existing user.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "Password123!"
}
```

**Response:** `200 OK` (same structure as registration)

### Driver Profile Management

#### POST /users/driver-profile

Create a driver profile with vehicle information. Requires JWT authentication and DRIVER role.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Request Body:**

```json
{
  "vehicleMake": "Toyota",
  "vehicleModel": "Camry",
  "vehicleYear": 2022,
  "vehiclePlate": "51A-12345",
  "vehicleColor": "Silver",
  "licenseNumber": "DL123456789"
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "userId": "uuid",
  "vehicleMake": "Toyota",
  "vehicleModel": "Camry",
  "vehicleYear": 2022,
  "vehiclePlate": "51A-12345",
  "vehicleColor": "Silver",
  "licenseNumber": "DL123456789",
  "approvalStatus": "PENDING",
  "createdAt": "2025-10-26T10:00:00.000Z",
  "updatedAt": "2025-10-26T10:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "driver@example.com",
    "role": "DRIVER",
    "firstName": "John",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "createdAt": "2025-10-26T10:00:00.000Z",
    "updatedAt": "2025-10-26T10:00:00.000Z"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid input data (missing fields, invalid year)
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - User does not have DRIVER role
- `409 Conflict` - Profile already exists, or duplicate vehicle plate/license number

**Validation Rules:**

- `vehicleYear`: Must be between 2000 and 2026
- `vehiclePlate`: Must be unique across all drivers
- `licenseNumber`: Must be unique across all drivers
- One profile per driver user

#### GET /users/driver-profile

Retrieve the authenticated driver's profile.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Response:** `200 OK` (same structure as POST response)

**Error Responses:**

- `401 Unauthorized` - Missing or invalid JWT token
- `404 Not Found` - Driver profile does not exist

### Trip Ratings

#### POST /trips/{tripId}/rating

Submit a rating for a completed trip. Only the passenger who took the trip can rate it. Requires JWT authentication and PASSENGER role.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Path Parameters:**

- `tripId`: UUID of the trip to rate

**Request Body:**

```json
{
  "stars": 5,
  "comment": "Excellent driver! Very friendly and safe driving."
}
```

**Request Schema:**

- `stars`: integer, required, minimum: 1, maximum: 5
- `comment`: string, optional, maximum length: 500 characters

**Response:** `201 Created`

```json
{
  "id": "rating-uuid",
  "tripId": "trip-uuid",
  "passengerId": "passenger-uuid",
  "driverId": "driver-uuid",
  "stars": 5,
  "comment": "Excellent driver! Very friendly and safe driving.",
  "createdAt": "2025-11-01T10:40:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request` - Invalid input data (stars out of range, comment too long) or trip not completed
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - User does not have PASSENGER role or is not the trip's passenger
- `404 Not Found` - Trip does not exist
- `409 Conflict` - Rating already exists for this trip

**Validation Rules:**

- Only passengers can submit ratings
- Only the passenger who took the trip can rate it
- Trip must be in COMPLETED status
- Each trip can only be rated once
- Stars must be integer between 1 and 5 inclusive
- Comment is optional but limited to 500 characters if provided

**Example curl command:**

```bash
curl -X POST \
  http://localhost:3000/trips/123e4567-e89b-12d3-a456-426614174000/rating \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "stars": 5,
    "comment": "Great driver!"
  }'
```

#### GET /trips/{tripId}/rating

Retrieve a rating for a specific trip. Passengers can view ratings they submitted; drivers can view ratings for their trips. Requires JWT authentication.

**Headers:**

```
Authorization: Bearer <access_token>
```

**Path Parameters:**

- `tripId`: UUID of the trip

**Response:** `200 OK`

**Passenger View (full rating details):**

```json
{
  "id": "rating-uuid",
  "tripId": "trip-uuid",
  "passengerId": "passenger-uuid",
  "driverId": "driver-uuid",
  "stars": 5,
  "comment": "Excellent driver! Very friendly and safe driving.",
  "createdAt": "2025-11-01T10:40:00.000Z"
}
```

**Driver View (passengerId excluded for privacy):**

```json
{
  "id": "rating-uuid",
  "tripId": "trip-uuid",
  "driverId": "driver-uuid",
  "stars": 5,
  "comment": "Excellent driver! Very friendly and safe driving.",
  "createdAt": "2025-11-01T10:40:00.000Z"
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - User is not authorized (not trip participant)
- `404 Not Found` - Trip does not exist or no rating exists for the trip

**Authorization Rules:**

- Passengers can view ratings they submitted (trip.passengerId === userId)
- Drivers can view ratings for their trips (trip.driverId === userId)
- Other users receive 403 Forbidden

**Example curl commands:**

**Passenger viewing their rating:**

```bash
curl -X GET \
  http://localhost:3000/trips/123e4567-e89b-12d3-a456-426614174000/rating \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Driver viewing rating for their trip:**

```bash
curl -X GET \
  http://localhost:3000/trips/123e4567-e89b-12d3-a456-426614174000/rating \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Driver Approval Status

The `approvalStatus` field indicates the current state of a driver's profile:

- **PENDING**: Profile created, awaiting admin approval (default)
- **APPROVED**: Profile approved, driver can accept trips
- **REJECTED**: Profile rejected by admin
- **SUSPENDED**: Driver temporarily suspended

### Health Check

#### GET /health

Check service health and database connectivity.

**Response:** `200 OK`

```json
{
  "status": "healthy",
  "timestamp": "2025-10-26T10:00:00.000Z",
  "database": "connected"
}
```

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
