Cyclic Symmetric Multi-Scale Turing Patterns in WebGL
=====================================================

This is an implementation of [Jonathan McCabe's Cyclic Symmetric Multi-Scale
Turing Patterns](http://www.jonathanmccabe.com/Cyclic_Symmetric_Multi-Scale_Turing_Patterns.pdf)
written in WebGL. [Softology's blog post](http://softologyblog.wordpress.com/2011/07/05/multi-scale-turing-patterns/)
detailing McCabe's algorithm was very helpful when writing this up.

Demo here: [http://afavaro.github.com/TuringPatterns/turing.html](http://afavaro.github.com/TuringPatterns/turing.html)

I've added some switches for the scales and different color modes for fun.

This demo uses a two pass box blur to calculate the activator and inhibitor
densities at the scales suggested by Softology over a 1024x512 grid. Each frame
is the result of the following render passes:

* Two passes per scale to calculate the activator and inhibitor densities.
* One pass to apply the circular symmetries and update the grid with the
  appropriate value.
* One pass to color the grid and render it to the screen.
