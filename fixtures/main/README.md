# space-pizza

Interplanetary pizza delivery API. Routes orders from Earth to Mars via warp gates.

## Architecture

```
Customer → OrderRouter → WarpQueue → DeliveryTracker
                ↓
          CrustValidator (rejects invalid crusts before launch)
```

Orders are validated, queued by planetary alignment window, and tracked through warp transit.

## Modules

- `modules/delivery/` — order routing and dispatch
- `modules/queue/` — warp gate queue management
- `modules/validation/` — crust and topping validation
- `modules/tracking/` — transit tracking and ETA
