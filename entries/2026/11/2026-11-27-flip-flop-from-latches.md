---
title: Building a Flip Flop from Two Latches
date: 2026-11-27
section: digital-design-verification
---
Below is a diagram for a combination of latches to create a flip flop.

![A negative latch feeding a positive latch; the negative latch gets an inverted clock](images/2026-11-27-latch-flip-flop.jpg)

It is created from a positive and a negative latch, the positive latch getting the output of the negative latch as its input, while the negative latch has an inverted clock, but the positive does not. This whole system acts as a D flip flop.

The timing diagram is as seen below. The negative latch output, Q<sub>1</sub>, holds its value when the clk is high, no matter what the D (input) is. The positive latch output, Q<sub>2</sub>, is high when the clock is high when the clock and Q<sub>1</sub> are high. The flip flop output (Q<sub>2</sub>) is high during a clk high and Q<sub>1</sub> high, and stays high until the next clock rising edge.

![Timing diagram of CLK, D, Q1 and the flip flop output Q2](images/2026-11-27-latch-timing.jpg)

The setup time and hold time occur before and after a positive edge, respectively. In those regions prior to and after the clock edge, the value should not change between Low → High or High → Low.

Propagation delay was not considered in the prior diagram. Considering propagation delay, for example 2 ns per latch (both negative and positive), this means that if the input D goes high, Q<sub>1</sub> latches and comes out 2 ns later, and Q<sub>2</sub> the same. If the D signal is going high within the 2 ns propagation delay, then Q<sub>1</sub> sees 0, not 1. This is because the input changing is happening too close to the clk signal, within the propagation delay. The value considered in the latch is the value prior to the 2 ns propagation delay, which in this case is 0. Keep in mind that the input should not be changed within the propagation delay prior to the clk edge going positive (setup time), as this would result in an inaccurate output. The propagation delay of the latch is the cause of the setup time, and the propagation delay from the inverter is the cause of the hold time (through the second latch).

![The latch flip flop with a 1 ns inverter and 2 ns latches, and the timing of D changing within 2 ns of the clock edge](images/2026-11-27-propagation-delay.jpg)

The takeaway is that the input should not be changed within the setup time and hold time.
