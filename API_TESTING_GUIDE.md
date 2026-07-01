# Smart Parking - User Management API Testing Guide

This guide provides a comprehensive manual on how to test all user management endpoints (`client`, `company`, `employee`, `super_admin`) on the Smart Parking backend.

---

## 🚀 Server URL
`http://localhost:5000`

> **Note on Authentication:**
> All requests marked **[Protected]** require you to supply the `Authorization` header:
> - **Key:** `Authorization`
> - **Value:** `Bearer <your_jwt_token_here>`

---

## 1. Complete API Reference

### 👥 Authentication Routes (`/api/auth`)

#### A. Register User
- **Method:** `POST`
- **Path:** `/api/auth/register`
- **Description:** Creates a new account.
- **Client Body:**
```json
{
  "name": "Jean Dupont",
  "email": "jean.dupont@example.com",
  "password": "superSecret123",
  "phone": "0612345678",
  "role": "client",
  "vehiclePlate": "AA123BB",
  "vehicleSerialNumber": "VF3123456789",
  "vehicleType": "car"
}
```
- **Company Body:**
```json
{
  "name": "Eiffage Parking SA",
  "email": "contact@eiffage-parking.com",
  "password": "eiffagePass123",
  "phone": "0198765432",
  "role": "company",
  "address": "12 Boulevard de l'Europe, 69002 Lyon",
  "siret": "98765432100025"
}
```

#### B. Login
- **Method:** `POST`
- **Path:** `/api/auth/login`
- **Description:** Validates credentials and returns a JWT token.
- **Body:**
```json
{
  "email": "jean.dupont@example.com",
  "password": "superSecret123"
}
```

#### C. Forgot Password
- **Method:** `POST`
- **Path:** `/api/auth/forgot-password`
- **Description:** Requests a password-reset token (saves email in mock inbox).
- **Body:**
```json
{
  "email": "jean.dupont@example.com"
}
```

#### D. Reset Password
- **Method:** `POST`
- **Path:** `/api/auth/reset-password`
- **Description:** Resets password using the token received.
- **Body:**
```json
{
  "token": "reset-token-received",
  "password": "newSecurePassword123"
}
```

---

### 👤 Profile & Employee Routes (`/api/users`)

#### A. Get Self Profile **[Protected]**
- **Method:** `GET`
- **Path:** `/api/users/me`

#### B. Update Self Profile **[Protected]**
- **Method:** `PUT`
- **Path:** `/api/users/me`
- **Body:**
```json
{
  "name": "Updated Name",
  "phone": "0600000000"
}
```

#### C. Delete Own Account **[Protected]**
- **Method:** `DELETE`
- **Path:** `/api/users/me`

#### D. Submit Parking Integration Request **[Protected - Company Only]**
- **Method:** `POST`
- **Path:** `/api/users/parking-request`
- **Description:** Company submits a parking integration request containing all necessary attributes. This generates a simulated email to notify the admin.
- **Body:**
```json
{
  "name": "Parking Bellecour Eiffage",
  "address": "Place Bellecour",
  "city": "Lyon",
  "zipCode": "69002",
  "totalSpots": 150,
  "pricePerHour": 3.2
}
```

#### E. Create Employee **[Protected - Company/Admin]**
- **Method:** `POST`
- **Path:** `/api/users/employees`
- **Description:** Enforces that the company must have at least one *approved* parking, and the target `parkingId` must belong to an approved parking owned by that company. Asserts the 1-employee-per-parking limit.
- **Body:**
```json
{
  "name": "Sarah Connor",
  "email": "sarah.connor@eiffage-parking.com",
  "password": "t800employee",
  "phone": "0600000000",
  "parkingId": "approved-parking-id",
  "position": "agent",
  "permissions": ["scan_qr", "manage_spots"]
}
```

#### F. Get Company Employees **[Protected - Company/Admin]**
- **Method:** `GET`
- **Path:** `/api/users/employees`

---

### 🛡️ Admin Routes (`/api/admin`) **[Protected - Super Admin Only]**

#### A. Get All Companies
- **Method:** `GET`
- **Path:** `/api/admin/companies`

#### B. Approve Company Account
- **Method:** `PUT`
- **Path:** `/api/admin/companies/:id/approve`

#### C. Reject Company Account
- **Method:** `PUT`
- **Path:** `/api/admin/companies/:id/reject`
- **Body:**
```json
{
  "reason": "Le numéro de SIRET n'existe pas dans le registre du commerce."
}
```

#### D. Suspend Company Account
- **Method:** `PUT`
- **Path:** `/api/admin/companies/:id/suspend`

#### E. Get All Parking Requests
- **Method:** `GET`
- **Path:** `/api/admin/parkings`

#### F. Approve Parking Request
- **Method:** `PUT`
- **Path:** `/api/admin/parkings/:id/approve`

#### G. Reject Parking Request
- **Method:** `PUT`
- **Path:** `/api/admin/parkings/:id/reject`
- **Body:**
```json
{
  "reason": "Les tarifs proposés ne respectent pas le barème municipal."
}
```

---

### 📧 Mock Virtual Mailbox (`/api/mock-emails`)

#### A. Get Mock Mailbox Emails
- **Method:** `GET`
- **Path:** `/api/mock-emails`

#### B. Empty Virtual Mailbox
- **Method:** `DELETE`
- **Path:** `/api/mock-emails`

---

## 2. End-to-End Company Integration & Employee Scenario

Test the complete business logic flow using these steps:

1. **Company Registration**: Register Eiffage Parking. The company is pending approval.
2. **Company Login**: Authenticate to obtain the JWT token.
3. **Try Employee Creation (Blocked)**: Try to create an employee -> Rejected since the company has no approved parking.
4. **Submit Parking**: Submit a parking request. The admin receives a mock email.
5. **Admin Login**: Authenticate as Super Admin.
6. **Admin Decision**: Approve the parking integration request. The company receives a notification.
7. **Create Employee (Success)**: Submit the employee creation again with the approved parking's ID -> Success! The employee is sent an email containing their login credentials.
8. **Check Mock Emails**: Fetch `/api/mock-emails` to verify the emails sent during the flow.
