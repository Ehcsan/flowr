import { assertSliced, withShell } from '../../helper/shell'

// TODO: test something like a <- function() { x };  x <- 3; y <- 2; a()

describe('With Call', withShell(shell => {
  describe('Simple', () => {
    const code = `i <- 4
a <- function(x) { x }
a(i)`
    for (const criterion of ['3:1', '3@a'] as const) {
      assertSliced(JSON.stringify(code), shell, code, [criterion], code)
    }
    const constFunction = `i <- 4
a <- function(x) { x <- 2; 1 }
a(i)`
    assertSliced('Function call with constant function', shell, constFunction, ['3:1'], `i <- 4
a <- function(x) { 1 }
a(i)`)
    // TODO: should we really keep that open? edge case?
    assertSliced('Slice function definition', shell, constFunction, ['2@a'], `a <- function(x) { }`)
    assertSliced('Slice within function', shell, constFunction, ['2:20'], `x <- 2`)
  })
  describe('Functions using environment', () => {
    describe('Read variable defined before', () => {
      const code = `i <- 4
a <- function(x) { x + i }
a(4)`
      for(const criterion of ['3:1', '3@a'] as const) {
        assertSliced('Must include read', shell, code, [criterion], code)
      }
    })
    describe('Read variable defined after', () => {
      const code = `a <- function(x) { x + i }
i <- 4
a(5)`
      for(const criterion of ['3:1', '3@a'] as const) {
        assertSliced('Must include read', shell, code, [criterion], code)
      }
    })
    describe('Read variable defined before and after', () => {
      const code = `i <- 3
a <- function(x) { x + i }
i <- 4
a(5)`
      for(const criterion of ['4:1', '4@a'] as const) {
        assertSliced('Only keep second definition', shell, code, [criterion], `a <- function(x) { x + i }
i <- 4
a(5)`)
      }
    })
  })
  describe('Functions with named arguments', () => {
    const code = `a <- function(x=4) { x }
a(x = 3)`
    assertSliced('Must include function definition', shell, code, ['2@a'], code)
  })
  describe('Functions with nested definitions', () => {
    describe('Simple Function pass with return', () => {
      // TODO: limitation, does not work with <<- or anything which modifies the static resolutions at the moment
      const code = `a <- function() { a <- 2; return(function() { 1 }) }
b <- a()
b()`
      assertSliced('Must include outer function', shell, code, ['2@a'], `a <- function() { return(function() { 1 }) }
a()`)
      assertSliced('Must include linked function', shell, code, ['3@b'], `a <- function() { return(function() { 1 }) }
b <- a()
b()`)
    })
    describe('Functions binding multiple scopes', () => {
      const code = `
a <- function() { x <- function() { z + y }; y <- 12; return(x) }
y <- 5
z <- 5
u <- a()
u()`
      assertSliced('Must include function shell', shell, code, ['5@a'], `a <- function() {
        x <- function() { z + y }
        y <- 12
        return(x)
    }
z <- 5
a()`)
      /*      assertSliced('Must include function shell', shell, code, ['6@u'], `a <- function() {
        x <- function() { }
        return(x)
    }
a()`)*/
    })
  })
}))
