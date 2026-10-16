# Gate Fixer

A browser game for teaching logic gates to Grade 12 students. Each level shows a circuit with one or more missing gates and a target truth table. Students choose gates for the empty slots, then test the circuit: it runs every input combination while 3D signals travel through the wires, and each row of the truth table is marked right or wrong.

Built with [three.js](https://threejs.org/) (r128, loaded from cdnjs). No build step.

## Levels

1. Ignition interlock (AND)
2. Two doorbells (OR)
3. Staircase light (XOR)
4. Seatbelt warning (NAND)
5. Through an inverter (choose the gate before a NOT)
6. Sprinkler control (three inputs)
7. Enabled parity check (two missing gates)
8. Half adder (two outputs: sum and carry)

Stars reward getting a level right on the first test. Progress is saved in the browser's local storage.

## Run it

Open `index.html` through any static web server, for example:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000. It also works as-is on GitHub Pages.

## Controls

- Click a dashed slot in the 3D view (or a slot button) to select it.
- Pick a gate from the palette, or press keys `1` to `6`.
- **Test all inputs** checks the circuit against the target truth table.
- The **Gate reference** panel lists every gate's truth table and rule.

## Files

- `index.html`: the game and its levels
- `gates3d.js`: shared three.js kit (gate shapes, switches, lamps, wires, circuit evaluation and signal animation)
- `shared.css`: layout and styles
