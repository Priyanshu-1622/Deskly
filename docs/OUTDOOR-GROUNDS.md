# Outdoor grounds and performance

Deskly keeps one ground-floor office with its established room layout, CEO office, desks, reception, meeting rooms, roof and skylights. The surrounding grounds include trees, streets, parked cars, courtyard seating and a fountain. The entrance connects directly to the office navigation grid.

## Performance

Outdoor props share merged geometry. Repeated authored trees use material batching and instancing, with distance and view culling. Detailed employees keep separate skeletons; distant animation and shadows update less often. Nearby indoor lamps are limited, HUD updates are throttled, and sustained slow frames can reduce rendering scale through the existing Smooth performance setting.

These changes retain the existing authored assets. FPS still depends on hardware, resolution and scene; no guaranteed improvement percentage is claimed.

## Access checks

Collision data and visual placements agree for the relocated kitchen lockers, washroom extinguisher, corridor cooler and server racks. Automated checks verify player-sized routes into all 16 enclosed rooms and access to office activities. Desktop checks verify entry, CEO seating, full-team meeting travel and renderer errors.
