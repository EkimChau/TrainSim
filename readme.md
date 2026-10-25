## The Presentation Canvas (The View)

- Google Maps Engine: You want to use Google Maps as your main web canvas layer for global navigation, panning, and zooming.
- OpenRailwayMap (**ORM**) Overlay: You want to ingest and extract vector track configurations (Ways), station nodes, and signaling data from **ORM**/OpenStreetMap and overlay them directly on top of the Google Maps canvas with **WGS84** coordinate precision.
- Dynamic UI Controls: The interface must feature modular toggle switches to instantly turn individual **ORM** layers (Tracks, Signals, Stations) on and off.

## The Logic & Engineering Stack (The Data Model)

- SimSpec (The Layout Compiler): An infrastructure compiler based on international **UNISIG** and **ETCS** Level 2 engineering specifications. It takes raw, simplified track pathways from **ORM** and programmatically injects missing microscopic trackside instruments—specifically physical Eurobalises (virtual beacons) and interlocking block boundaries—in the correct engineering places.
- SimScene (The Scenario Specification): A standardized configuration profile that defines specific operational test scenarios. This file details global environment rules, timetables, active train fleets, route allocations, and artificial incidents (like a vehicle breakdown or a doors-stuck event).
- SimRun (The Execution Engine): A deterministic runtime engine that executes the selected scenario. It computes real-time vehicle kinematics, movement authority updates from a virtual Radio Block Centre (**RBC**), **ETCS** braking curves, and schedule performance to actively catch infrastructure conflicts, delays, and safety bubble violations.

## Current Project State

- You have a packaged, self-contained prototype application (brisbane_simscene_app.zip) implementing this architectural framework locally.
- You are currently reviewing the deployment practicalities, including verifying the cost-free boundaries of hooking the code up to the Google Maps Platform **API** key grid.

-----

Project component boundaries and role

- Gmap - serves as the canvas, use its apis to interact with overlays and sims layer hook ins
    - SimAdaptor - mappings and apis to call **GMAP** for all supported methods.

{ train sim pure code }
- SimAdaptor (everything to Gmap, push or pull data)

- SimSpec
    - App, all configurations, api etc, and **ORM** scoped to (brisbane and surrounds - limit of the sim world)
    - Laws - sub set of Rules (engine rules) following 
    - Railway Laws, **ETCSL** 0, 1, 2; **ESIG** (needs relational datatable)

- BaseModels - (Base model Types/classes) Base component model for all **SIM** component items and properties, base class require properties to be configured to conform with laws/rules/component types up of rules laws and region (deployed specs).  It represents real life components, unconfigured.
    - the world model
    - train model
    - signalling model (balise groups, rbc towers, shunting) - all base classes, recognised by Sim, each implementation creates a new instance of balise: adds the deployed location and configs for the deployd location in the sim.

- SimWorld - Wholey owned by train sim, mirrored verbatim off **ORM**, for the defined region, this is the **SIMS** operating map, and lists all component sites, takes BaseModels configs them to match SimWorld.
    - Track - knows the tracks, stations, tunnels, bends (sim track model)
    - Trackside - knows the signalling requirements and locations of balise, towers, shunts (sim signals)
    - Train - (the motor) onboard Model programmed behaviours, eg: RBC told to emergency stop
    - ETG - schedules
    - Command
        - Rail control center, all motor locations
        - Plays schedules
        - Knows where all trains are
        - plays scenario
    - Play scenario, based on the world apply the scenario and watch
    - SimStates - returns all World model values at runtime, what is train x position and spee, why did it not slow down (catch bug in model rules missing, law not implemented)

- SimRunModel - combination of scenario and simworld simulations, applies the sim
- Sim overlay - The actually live simulation layer - watch models interact following tms system rules, and schedules

Prototype steps 1 - Build a express/node.js env html boiler plate for resuable js bun packing, and gis auth 2 - rebase seed code, and refactor onto new dev platform, with component separation