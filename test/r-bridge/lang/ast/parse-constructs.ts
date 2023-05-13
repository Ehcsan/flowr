import { assertAst, retrieveAst, withShell } from '../../../helper/shell'
import { exprList, numVal } from "../../../helper/ast-builder"
import { addRanges, rangeFrom } from "../../../../src/util/range"
import { Type } from "../../../../src/r-bridge/lang:4.x/ast/model/type"

const IfThenSpacingVariants = [
  {
    str:          "if(TRUE)1",
    locationTrue: rangeFrom(1, 4, 1, 7),
    locationNum:  rangeFrom(1, 9, 1, 9),
    num:          1,
    end:          rangeFrom(1, 9, 1, 9),
  },
  {
    str:          "if(TRUE) 1",
    locationTrue: rangeFrom(1, 4, 1, 7),
    locationNum:  rangeFrom(1, 10, 1, 10),
    num:          1,
    end:          rangeFrom(1, 10, 1, 10),
  },
  {
    str:          "if (TRUE) 1",
    locationTrue: rangeFrom(1, 5, 1, 8),
    locationNum:  rangeFrom(1, 11, 1, 11),
    num:          1,
    end:          rangeFrom(1, 11, 1, 11),
  },
  {
    str:          "if     (TRUE)  42",
    locationTrue: rangeFrom(1, 9, 1, 12),
    locationNum:  rangeFrom(1, 16, 1, 17),
    num:          42,
    end:          rangeFrom(1, 17, 1, 17),
  },
  {
    str:          "if\n(TRUE)1",
    locationTrue: rangeFrom(2, 2, 2, 5),
    locationNum:  rangeFrom(2, 7, 2, 7),
    num:          1,
    end:          rangeFrom(2, 7, 2, 7),
  },
  {
    str:          "if(TRUE)\n1",
    locationTrue: rangeFrom(1, 4, 1, 7),
    locationNum:  rangeFrom(2, 1, 2, 1),
    num:          1,
    end:          rangeFrom(2, 1, 2, 1),
  },
  {
    str:          "if\n(\nTRUE\n)\n1",
    locationTrue: rangeFrom(3, 1, 3, 4),
    locationNum:  rangeFrom(5, 1, 5, 1),
    num:          1,
    end:          rangeFrom(5, 1, 5, 1),
  },
]

const IfThenBraceVariants = [{
  str:          'if(TRUE){1}',
  locationTrue: rangeFrom(1, 4, 1, 7),
  locationNum:  rangeFrom(1, 10, 1, 10),
  num:          1,
  end:          rangeFrom(1, 11, 1, 11)
}, {
  str:          'if(TRUE){42}',
  locationTrue: rangeFrom(1, 4, 1, 7),
  locationNum:  rangeFrom(1, 10, 1, 11),
  num:          42,
  end:          rangeFrom(1, 12, 1, 12)
}, {
  str:          'if(TRUE){{{1}}}',
  locationTrue: rangeFrom(1, 4, 1, 7),
  locationNum:  rangeFrom(1, 12, 1, 12),
  num:          1,
  end:          rangeFrom(1, 15, 1, 15)
}]

// suffix of if-then counterparts
const ElseSpacingVariants = [{
  /* one space/newline around is the minimum for R */
  str:          ' else 2',
  locationElse: rangeFrom(0, 7, 0, 7),
  num:          2
}, {
  str:          ' else  2',
  locationElse: rangeFrom(0, 8, 0, 8),
  num:          2
}]

const ElseBracesVariants = [{
  str:          ' else {2}',
  locationElse: rangeFrom(0, 8, 0, 8),
  num:          2
}, {
  str:          ' else {{{42}}}',
  locationElse: rangeFrom(0, 10, 0, 11),
  num:          42
}]

describe('4. Parse simple constructs', withShell(shell => {
  describe('4.1 if', () => {
    describe('1.1 if-then', () => {
      for (const pool of [{name: 'braces', variants: IfThenBraceVariants}, {
        name:     'spacing',
        variants: IfThenSpacingVariants
      }]) {
        describe(`${pool.name} variants`, () => {
          for (const variant of pool.variants) {
            const strNum = `${variant.num}`
            assertAst(JSON.stringify(variant.str), shell, variant.str, exprList({
              type:      Type.If,
              // TODO: maybe merge in future?
              location:  rangeFrom(1, 1, 1, 2),
              lexeme:    'if',
              condition: {
                type:     Type.Logical,
                location: variant.locationTrue,
                lexeme:   'TRUE',
                content:  true
              },
              then: {
                type:     Type.Number,
                location: variant.locationNum,
                lexeme:   strNum,
                content:  numVal(variant.num)
              }
            }))
          }
        })
      }
    })
    describe('1.2 if-then-else', () => {
      for (const elsePool of [{name: 'braces', variants: ElseBracesVariants}, {
        name:     'spacing',
        variants: ElseSpacingVariants
      }]) {
        for (const ifThenPool of [{name: 'braces', variants: IfThenBraceVariants}, {
          name:     'spacing',
          variants: IfThenSpacingVariants
        }]) {
          describe(`if-then: ${ifThenPool.name}, else: ${elsePool.name}`, () => {
            for (const elseVariant of elsePool.variants) {
              for (const ifThenVariant of ifThenPool.variants) {
                const thenNum = `${ifThenVariant.num}`
                const elseNum = `${elseVariant.num}`
                const input = `${ifThenVariant.str}${elseVariant.str}`
                assertAst(JSON.stringify(input), shell, input, exprList({
                  type:      Type.If,
                  // TODO: maybe merge in future?
                  location:  rangeFrom(1, 1, 1, 2),
                  lexeme:    'if',
                  condition: {
                    type:     Type.Logical,
                    location: ifThenVariant.locationTrue,
                    lexeme:   'TRUE',
                    content:  true
                  },
                  then: {
                    type:     Type.Number,
                    location: ifThenVariant.locationNum,
                    lexeme:   thenNum,
                    content:  numVal(ifThenVariant.num)
                  },
                  otherwise: {
                    type:     Type.Number,
                    location: addRanges(elseVariant.locationElse, ifThenVariant.end),
                    lexeme:   elseNum,
                    content:  numVal(elseVariant.num)
                  }
                }))
              }
            }
          })
        }
      }
    })
  })
  // TODO: with and without braces
  describe('4.2 loops', () => {
    describe('1.3 for', () => {
      assertAst('for(i in 1:10) 2', shell, 'for(i in 1:42)2', exprList({
        type:     Type.For,
        location: rangeFrom(1, 1, 1, 3),
        lexeme:   'for',
        variable: {
          type:      Type.Symbol,
          location:  rangeFrom(1, 5, 1, 5),
          namespace: undefined,
          lexeme:    'i',
          content:   'i'
        },
        vector: {
          type:     Type.BinaryOp,
          flavor:   'arithmetic',
          op:       ':',
          location: rangeFrom(1, 11, 1, 11),
          lexeme:   ':',
          lhs:      {
            type:     Type.Number,
            location: rangeFrom(1, 10, 1, 10),
            lexeme:   '1',
            content:  numVal(1)
          },
          rhs: {
            type:     Type.Number,
            location: rangeFrom(1, 12, 1, 13),
            lexeme:   '42',
            content:  numVal(42)
          }
        },
        body: {
          type:     Type.Number,
          location: rangeFrom(1, 15, 1, 15),
          lexeme:   '2',
          content:  numVal(2)
        }
      })
      )
    })
    describe('1.4 repeat', () => {
      assertAst('repeat 2', shell, 'repeat 2', exprList({
        type:     Type.Repeat,
        location: rangeFrom(1, 1, 1, 6),
        lexeme:   'repeat',
        body:     {
          type:     Type.Number,
          location: rangeFrom(1, 8, 1, 8),
          lexeme:   '2',
          content:  numVal(2)
        }
      }))
      assertAst('repeat { x; y }', shell, 'repeat { x; y }', exprList({
        type:     Type.Repeat,
        location: rangeFrom(1, 1, 1, 6),
        lexeme:   'repeat',
        body:     {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 8, 1, 15),
          lexeme:   '{ x; y }',
          children: [{
            type:      Type.Symbol,
            location:  rangeFrom(1, 10, 1, 10),
            namespace: undefined,
            lexeme:    'x',
            content:   'x'
          }, {
            type:      Type.Symbol,
            location:  rangeFrom(1, 13, 1, 13),
            namespace: undefined,
            lexeme:    'y',
            content:   'y'
          }]
        }
      }))
    })
    describe('1.5 while', () => {
      assertAst('while (TRUE) 42', shell, 'while (TRUE) 42', exprList({
        type:      Type.While,
        location:  rangeFrom(1, 1, 1, 5),
        lexeme:    'while',
        condition: {
          type:     Type.Logical,
          location: rangeFrom(1, 8, 1, 11),
          lexeme:   'TRUE',
          content:  true
        },
        body: {
          type:     Type.Number,
          location: rangeFrom(1, 14, 1, 15),
          lexeme:   '42',
          content:  numVal(42)
        }
      }))

      assertAst('while (FALSE) { x; y }', shell, 'while (FALSE) { x; y }', exprList({
        type:      Type.While,
        location:  rangeFrom(1, 1, 1, 5),
        lexeme:    'while',
        condition: {
          type:     Type.Logical,
          location: rangeFrom(1, 8, 1, 12),
          lexeme:   'FALSE',
          content:  false
        },
        body: {
          type:     Type.ExpressionList,
          location: rangeFrom(1, 15, 1, 22),
          lexeme:   '{ x; y }',
          children: [{
            type:      Type.Symbol,
            location:  rangeFrom(1, 17, 1, 17),
            namespace: undefined,
            lexeme:    'x',
            content:   'x'
          }, {
            type:      Type.Symbol,
            location:  rangeFrom(1, 20, 1, 20),
            namespace: undefined,
            lexeme:    'y',
            content:   'y'
          }]
        }
      }))
    })
  })
}))