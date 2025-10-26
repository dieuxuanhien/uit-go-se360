# **SECTION 7: EXTERNAL APIS**

Based on the PRD requirements and component design, the UIT-Go system **does not require external API integrations** for Phase 1 (skeleton microservices).

**Rationale:**

- **Core functionality is self-contained:** User management, trip lifecycle, and driver location tracking are all implemented within the three microservices
- **Fare calculation is simplified:** Estimated fare uses a basic distance-based algorithm (Haversine formula) without real-time traffic data or dynamic pricing
- **No mapping/geocoding required:** Pickup and destination addresses are provided by the client; no reverse geocoding needed for MVP
- **No payment processing:** Trip completion records fare amounts but doesn't process actual payments (out of scope for academic project)
- **No SMS/email notifications:** Driver notifications and passenger updates can be implemented via WebSockets or polling in Phase 2 if needed

---

## **Potential External APIs for Phase 2 Specialization Modules**

If teams choose specific Phase 2 modules, they may integrate external services:

### **Phase 2 - Security Module:**

- **AWS Cognito API**
  - **Purpose:** Replace JWT auth with managed identity provider
  - **Documentation:** https://docs.aws.amazon.com/cognito/
  - **Authentication:** AWS SDK with IAM credentials
  - **Key Features:** User pools, federated identity (Google/Facebook login), MFA
  - **Integration Notes:** Migrate from JWT to Cognito access tokens; update auth guards

### **Phase 2 - Observability Module:**

- **AWS X-Ray API**
  - **Purpose:** Distributed tracing across microservices
  - **Documentation:** https://docs.aws.amazon.com/xray/
  - **Authentication:** AWS SDK with ECS task IAM role
  - **Key Features:** Service maps, trace visualization, latency analysis
  - **Integration Notes:** Install X-Ray daemon, instrument NestJS with `aws-xray-sdk`

### **Phase 2 - Scalability Module (Optional Enhancements):**

- **Google Maps Geocoding API**
  - **Purpose:** Convert lat/lng to human-readable addresses
  - **Documentation:** https://developers.google.com/maps/documentation/geocoding
  - **Base URL:** https://maps.googleapis.com/maps/api/geocode/json
  - **Authentication:** API key in query parameter
  - **Rate Limits:** 50 requests/second (pay-as-you-go pricing)
  - **Key Endpoints:**
    - `GET /geocode/json?latlng={lat},{lng}&key={apiKey}` - Reverse geocoding
  - **Integration Notes:** Cache results to minimize API calls; handle rate limiting with exponential backoff

- **Google Maps Distance Matrix API**
  - **Purpose:** Real-time ETA and fare calculation with traffic data
  - **Documentation:** https://developers.google.com/maps/documentation/distance-matrix
  - **Base URL:** https://maps.googleapis.com/maps/api/distancematrix/json
  - **Authentication:** API key in query parameter
  - **Rate Limits:** 100 elements/second
  - **Key Endpoints:**
    - `GET /distancematrix/json?origins={origin}&destinations={dest}&key={apiKey}` - Calculate distance and duration
  - **Integration Notes:** Use for dynamic pricing based on traffic; cache frequently requested routes

---

## **Why No External APIs in Phase 1:**

**1. Academic Budget Constraints:**

- External APIs often have usage-based pricing
- Google Maps APIs: ~$5-7 per 1000 requests after free tier
- Keeping Phase 1 self-contained minimizes recurring costs

**2. Simplified Testing:**

- No API key management during development
- No external service dependencies for local Docker Compose testing
- No rate limiting concerns during load testing

**3. Learning Focus:**

- PRD emphasizes system architecture and cloud infrastructure
- Building core microservices logic is more valuable than API integration
- External APIs can be added incrementally in Phase 2

**4. Fare Estimation Algorithm (Internal):**

```typescript
// TripService: fare-calculator.service.ts
export class FareCalculator {
  private readonly BASE_FARE = 200; // $2.00 in cents
  private readonly PER_KM_RATE = 150; // $1.50 per km in cents
  private readonly PER_MINUTE_RATE = 30; // $0.30 per minute in cents

  calculateEstimatedFare(distanceKm: number): number {
    const distanceFare = Math.round(distanceKm * this.PER_KM_RATE);

    // Estimate duration: assume 30 km/h average speed
    const estimatedMinutes = (distanceKm / 30) * 60;
    const timeFare = Math.round(estimatedMinutes * this.PER_MINUTE_RATE);

    return this.BASE_FARE + distanceFare + timeFare;
  }

  // Haversine formula for distance calculation
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
```

**5. Address Handling:**

- Client (mobile app/Postman) provides both coordinates AND human-readable addresses
- No reverse geocoding needed on backend
- Example request:

```json
{
  "pickupLatitude": 10.762622,
  "pickupLongitude": 106.660172,
  "pickupAddress": "District 1, Ho Chi Minh City",
  "destinationLatitude": 10.823099,
  "destinationLongitude": 106.629662,
  "destinationAddress": "Tan Binh District, Ho Chi Minh City"
}
```

---

## **Migration Path for External APIs (Future Enhancement):**

If a team wants to add external APIs in Phase 2, the recommended pattern is:

**1. Create Integration Layer:**

```typescript
// trip-service/src/integrations/maps.client.ts
export class MapsClient {
  async reverseGeocode(lat: number, lng: number): Promise<string> {
    // Google Maps API call
  }

  async calculateRoute(origin, destination): Promise<RouteInfo> {
    // Distance Matrix API call
  }
}
```

**2. Environment Configuration:**

```bash
# .env
GOOGLE_MAPS_API_KEY=your_api_key_here
ENABLE_EXTERNAL_GEOCODING=true
```

**3. Feature Flagging:**

```typescript
// Use external API if enabled, otherwise use Haversine
if (process.env.ENABLE_EXTERNAL_GEOCODING === 'true') {
  return await this.mapsClient.calculateRoute(origin, destination);
} else {
  return this.fareCalculator.calculateEstimatedFare(distance);
}
```

**4. Caching Layer:**

```typescript
// Cache frequently requested routes in Redis
const cacheKey = `route:${originLat},${originLng}:${destLat},${destLng}`;
const cached = await this.redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await this.mapsClient.calculateRoute(origin, destination);
await this.redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 hour TTL
return result;
```

---

## **Summary:**

**Phase 1 (Current):** Zero external API dependencies - fully self-contained system

**Phase 2 Options (If Needed):**

- **Security Module:** AWS Cognito for advanced authentication
- **Observability Module:** AWS X-Ray for distributed tracing
- **Scalability Module:** Google Maps APIs for enhanced features (optional)

**Cost Projection (if external APIs added):**

- AWS Cognito: ~$0.0055/MAU after 50K free tier
- AWS X-Ray: ~$5/month for typical usage
- Google Maps: ~$20-50/month for moderate usage with caching

---

**Select 1-9 or just type your question/feedback:**

1. **Proceed to next section** (Core Workflows)
2. **Expand or Contract for Audience** - Adjust external API detail
3. **Explain Reasoning (CoT Step-by-Step)** - Deeper dive into no-external-API decision
4. **Critique and Refine** - Challenge this approach
5. **Analyze Logical Flow and Dependencies** - Review self-contained design
6. **Assess Alignment with Overall Goals** - Verify PRD alignment
7. **Identify Potential Risks and Unforeseen Issues** - Risks of no external APIs?
8. **Challenge from Critical Perspective** - Should we use external APIs?
9. **Tree of Thoughts Deep Dive** - Explore external API alternatives

dieuxuanhien: 1

GitHub Copilot: Perfect! Moving to Core Workflows section.

---
