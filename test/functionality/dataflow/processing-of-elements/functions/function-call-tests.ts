import { assertDataflow, withShell } from '../../../_helper/shell'
import { EdgeType, initializeCleanEnvironments } from '../../../../../src/dataflow'
import { define, popLocalEnvironment, pushLocalEnvironment } from '../../../../../src/dataflow/environments'
import { UnnamedArgumentPrefix } from '../../../../../src/dataflow/internal/process/functions/argument'
import { UnnamedFunctionCallPrefix } from '../../../../../src/dataflow/internal/process/functions/function-call'
import { LocalScope } from '../../../../../src/dataflow/environments/scopes'
import { MIN_VERSION_LAMBDA } from '../../../../../src/r-bridge/lang-4.x/ast/model/versions'
import { emptyGraph } from '../../../_helper/dataflowgraph-builder'

describe('Function Call', withShell(shell => {
	describe('Calling previously defined functions', () => {
		const envWithXParamDefined = define(
			{nodeId: '4', scope: 'local', name: 'x', used: 'always', kind: 'parameter', definedAt: '5' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments()))
		const envWithFirstI = define(
			{nodeId: '0', scope: 'local', name: 'i', used: 'always', kind: 'variable', definedAt: '2' },
			LocalScope,
			initializeCleanEnvironments()
		)
		const envWithIA = define(
			{nodeId: '3', scope: 'local', name: 'a', used: 'always', kind: 'function', definedAt: '9' },
			LocalScope,
			envWithFirstI
		)
		assertDataflow('Calling function a', shell, 'i <- 4; a <- function(x) { x }\na(i)',
			emptyGraph()
				.definesVariable('0', 'i')
				.definesVariable('3', 'a', LocalScope, {environment: envWithFirstI})
				.uses('11', 'i', 'always', envWithIA)
				.uses('12', `${UnnamedArgumentPrefix}12`, 'always', envWithIA)
				.addVertex({
					tag:         'function-call',
					id:          '13',
					name:        'a',
					environment: envWithIA,
					args:        [{
						nodeId: '12', name: `${UnnamedArgumentPrefix}12`, scope: LocalScope, used: 'always'
					}] })
				.addVertex({
					tag:         'function-definition',
					id:          '8',
					name:        '8',
					scope:       LocalScope,
					exitPoints:  [ '6' ],
					environment: popLocalEnvironment(envWithXParamDefined),
					subflow:     {
						out:               [],
						in:                [],
						unknownReferences: [],
						scope:             LocalScope,
						environments:      envWithXParamDefined,
						graph:             new Set(['4', '6']),
					}})
				.definesVariable('4', 'x', LocalScope, {environment: pushLocalEnvironment(initializeCleanEnvironments())}, false)
				.addVertex({ tag: 'use', id: '6', name: 'x', environment: envWithXParamDefined}, false)
				.reads('6', '4')
				.reads('11', '0')
				.definedBy('3', '8')
				.argument('13', '12')
				.reads('12', '11')
				.reads('13', '3')
				.calls('13', '8')
				.returns('13', '6')
				.definesOnCall('12', '4')
		)
		const envWithIAB = define(
			{nodeId: '10', scope: 'local', name: 'b', used: 'always', kind: 'variable', definedAt: '12' },
			LocalScope,
			envWithIA
		)
		assertDataflow('Calling function a with an indirection', shell, 'i <- 4; a <- function(x) { x }\nb <- a\nb(i)',
			emptyGraph()
				.definesVariable('0', 'i')
				.definesVariable('3', 'a', LocalScope, {environment: envWithFirstI})
				.definesVariable('10', 'b', LocalScope, {environment: envWithIA})
				.uses('11', 'a', 'always', envWithIA )
				.uses('14', 'i', 'always', envWithIAB )
				.uses('15', `${UnnamedArgumentPrefix}15`, 'always', envWithIAB )
				.addVertex({
					tag:         'function-call',
					id:          '16',
					name:        'b',
					environment: envWithIAB,
					args:        [{
						nodeId: '15', name: `${UnnamedArgumentPrefix}15`, scope: LocalScope, used: 'always'
					}] })
				.addVertex({
					tag:         'function-definition',
					id:          '8',
					name:        '8',
					scope:       LocalScope,
					exitPoints:  [ '6' ],
					environment: popLocalEnvironment(envWithXParamDefined),
					subflow:     {
						out:               [],
						in:                [],
						unknownReferences: [],
						scope:             LocalScope,
						environments:      envWithXParamDefined,
						graph:             new Set(['4', '6'])
					}})
				.definesVariable('4', 'x', LocalScope, {environment: pushLocalEnvironment(initializeCleanEnvironments())}, false)
				.addVertex({ tag: 'use', id: '6', name: 'x', environment: envWithXParamDefined}, false)
				.reads('6', '4')
				.reads('14', '0')
				.definedBy('3', '8')
				.definedBy('10', '11')
				.reads('11', '3')
				.argument('16', '15')
				.reads('15', '14')
				.reads('16', '10')
				.calls('16', '8')
				.returns('16', '6')
				.definesOnCall('15', '4')
		)
		const envWithXConstDefined = define(
			{nodeId: '4', scope: 'local', name: 'x', used: 'always', kind: 'parameter', definedAt: '5' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments()))

		const envWithXDefinedForFunc = define(
			{nodeId: '6', scope: 'local', name: 'x', used: 'always', kind: 'variable', definedAt: '8' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments()))

		const envWithLastXDefined = define(
			{nodeId: '9', scope: 'local', name: 'x', used: 'always', kind: 'variable', definedAt: '11' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments()))
		const envWithIAndLargeA = define(
			{nodeId: '3', scope: 'local', name: 'a', used: 'always', kind: 'function', definedAt: '15' },
			LocalScope,
			envWithFirstI
		)
		assertDataflow('Calling with a constant function', shell, `i <- 4
a <- function(x) { x <- x; x <- 3; 1 }
a(i)`, emptyGraph()
			.definesVariable('0', 'i')
			.definesVariable('3', 'a', LocalScope, {environment: envWithFirstI})
			.uses('17', 'i', 'always', envWithIAndLargeA)
			.uses('18', `${UnnamedArgumentPrefix}18`, 'always', envWithIAndLargeA)
			.reads('17', '0')
			.addVertex({
				tag:         'function-call',
				id:          '19',
				name:        'a',
				environment: envWithIAndLargeA,
				args:        [{
					nodeId: '18', name: `${UnnamedArgumentPrefix}18`, scope: LocalScope, used: 'always'
				}]})
			.addVertex({
				tag:         'function-definition',
				id:          '14',
				name:        '14',
				environment: initializeCleanEnvironments(),
				scope:       LocalScope,
				exitPoints:  [ '12' ],
				subflow:     {
					out:               [],
					in:                [],
					unknownReferences: [],
					scope:             LocalScope,
					environments:      envWithLastXDefined,
					graph:             new Set(['4', '6', '7', '9'])
				}})
			.definesVariable('4', 'x', LocalScope, {environment: pushLocalEnvironment(initializeCleanEnvironments())}, false)
			.definesVariable('6', 'x', LocalScope, {environment: envWithXConstDefined}, false)
			.definesVariable('9', 'x', LocalScope, {environment: envWithXDefinedForFunc}, false)
			.addVertex({ tag: 'use', id: '7', name: 'x', environment: envWithXConstDefined}, false)
			.exits('12', '1', envWithLastXDefined, {}, false)
			.definedBy('6', '7')
			.reads('7', '4')
			.sameDef('6', '9')
			.sameDef('4', '9')
			.sameDef('4', '6')

			.definedBy('3', '14')
			.argument('19', '18')
			.reads('18', '17')
			.reads('19', '3')
			.calls('19', '14')
			.returns('19', '12')
			.definesOnCall('18', '4')
		)
	})

	describe('Directly calling a function', () => {
		const envWithXParameter = define(
			{nodeId: '0', scope: 'local', name: 'x', used: 'always', kind: 'parameter', definedAt: '1' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments())
		)
		const outGraph = emptyGraph()
			.addVertex({
				tag:  'function-call',
				id:   '9',
				name: `${UnnamedFunctionCallPrefix}9`,
				args: [
					{ nodeId: '8', name: `${UnnamedArgumentPrefix}8`, scope: LocalScope, used: 'always' }
				]
			})
			.addVertex({
				tag:         'function-definition',
				id:          '6',
				name:        '6',
				environment: initializeCleanEnvironments(),
				scope:       LocalScope,
				exitPoints:  [ '4' ],
				subflow:     {
					out:               [],
					in:                [],
					unknownReferences: [],
					scope:             LocalScope,
					environments:      envWithXParameter,
					graph:             new Set(['0', '2'])
				}
			})
			.definesVariable('0', 'x', LocalScope, {environment: pushLocalEnvironment(initializeCleanEnvironments())}, false)
			.addVertex({ tag: 'use', id: '2', name: 'x', environment: envWithXParameter }, false)
			.exits('4', '+', envWithXParameter , {}, false)
			.relates('2', '4')
			.reads('2', '0')

			.uses('8', `${UnnamedArgumentPrefix}8`)
			.argument('9', '8')
			.calls('9', '6')
			.returns('9', '4')
			.definesOnCall('8', '0')

		assertDataflow('Calling with constant argument using lambda', shell, '(\\(x) { x + 1 })(2)',
			outGraph,
			{ minRVersion: MIN_VERSION_LAMBDA }
		)
		assertDataflow('Calling with constant argument', shell, '(function(x) { x + 1 })(2)',
			outGraph
		)

		const envWithADefined = define(
			{nodeId: '0', scope: 'local', name: 'a', used: 'always', kind: 'function', definedAt: '6' },
			LocalScope,
			initializeCleanEnvironments()
		)

		assertDataflow('Calling a function which returns another', shell, `a <- function() { function() { 42 } }
a()()`,
		emptyGraph()
			.addVertex({
				tag:         'function-call',
				id:          '9',
				name:        `${UnnamedFunctionCallPrefix}9`,
				environment: envWithADefined,
				args:        []
			})
			.addVertex({
				tag:         'function-call',
				id:          '8',
				name:        'a',
				environment: envWithADefined,
				args:        []
			})
			.definesVariable('0', 'a')
			.addVertex({
				tag:         'function-definition',
				id:          '5',
				name:        '5',
				environment: initializeCleanEnvironments(),
				scope:       LocalScope,
				exitPoints:  [ '3' ],
				subflow:     {
					out:               [],
					in:                [],
					unknownReferences: [],
					scope:             LocalScope,
					environments:      pushLocalEnvironment(initializeCleanEnvironments()),
					graph:             new Set(['3'])

				}
			})
			.addVertex({
				tag:         'function-definition',
				id:          '3',
				name:        '3',
				environment: pushLocalEnvironment(initializeCleanEnvironments()),
				scope:       LocalScope,
				exitPoints:  [ '1' ],
				subflow:     {
					out:               [],
					in:                [],
					unknownReferences: [],
					scope:             LocalScope,
					environments:      pushLocalEnvironment(pushLocalEnvironment(initializeCleanEnvironments())),
					graph:             new Set()
				}
			}, false)

			.exits('1', '42', pushLocalEnvironment(pushLocalEnvironment(initializeCleanEnvironments())) , {}, false)


			.calls('9', '8')
			.reads('8', '0')
			.definedBy('0', '5')
			.calls('8', '5')
			.returns('8', '3')
			.calls('9', '3')
			.returns('9', '1')
		)
	})

	describe('Argument which is expression', () => {
		assertDataflow('Calling with 1 + x', shell, 'foo(1 + x)',
			emptyGraph()
				.addVertex({ tag: 'function-call', id: '5', name: 'foo', environment: initializeCleanEnvironments(), args: [{ nodeId: '4', name: `${UnnamedArgumentPrefix}4`, scope: LocalScope, used: 'always' }]})
				.uses('4', `${UnnamedArgumentPrefix}4`)
				.uses('2', 'x')
				.reads('4', '2')
				.argument('5', '4')
		)
	})

	describe('Argument which is anonymous function call', () => {
		assertDataflow('Calling with a constant function', shell, 'f(function() { 3 })',
			emptyGraph()
				.addVertex({ tag: 'function-call', id: '5', name: 'f', environment: initializeCleanEnvironments(), args: [{ nodeId: '4', name: `${UnnamedArgumentPrefix}4`, scope: LocalScope, used: 'always' }]})
				.uses('4', `${UnnamedArgumentPrefix}4`)
				.addVertex({
					tag:        'function-definition',
					id:         '3',
					name:       '3',
					scope:      LocalScope,
					exitPoints: [ '1' ],
					subflow:    {
						out:               [],
						in:                [],
						unknownReferences: [],
						scope:             LocalScope,
						environments:      pushLocalEnvironment(initializeCleanEnvironments()),
						graph:             new Set()
					}})
				.exits('1', '3', pushLocalEnvironment(initializeCleanEnvironments()) , {}, false)
				.reads('4', '3')
				.argument('5', '4')
		)
	})

	describe('Multiple out refs in arguments', () => {
		assertDataflow('Calling \'seq\'', shell, 'seq(1, length(pkgnames), by = stepsize)',
			emptyGraph()
				.addVertex({
					tag:         'function-call',
					id:          '11',
					name:        'seq',
					environment: initializeCleanEnvironments(),
					args:        [
						{ nodeId: '2', name: `${UnnamedArgumentPrefix}2`, scope: LocalScope, used: 'always' },
						{ nodeId: '7', name: `${UnnamedArgumentPrefix}7`, scope: LocalScope, used: 'always' },
						['by', { nodeId: '10', name: 'by', scope: LocalScope, used: 'always' }],
					]
				})
				.uses('2', `${UnnamedArgumentPrefix}2`)
				.uses('7', `${UnnamedArgumentPrefix}7`)
				.uses('10', 'by')
				.argument('11', '2')
				.argument('11', '7')
				.argument('11', '10')
				.uses('9', 'stepsize' )
				.reads('10', '9')
				.addVertex({
					tag:         'function-call',
					id:          '6',
					name:        'length',
					environment: initializeCleanEnvironments(),
					args:        [
						{ nodeId: '5', name: `${UnnamedArgumentPrefix}5`, scope: LocalScope, used: 'always' }
					]
				})
				.reads('7', '6')
				.uses('5', `${UnnamedArgumentPrefix}5`)
				.argument('6', '5')
				.uses('4', 'pkgnames' )
				.reads('5', '4')

		)
	})

	describe('Late function bindings', () => {
		const innerEnv = pushLocalEnvironment(initializeCleanEnvironments())
		const defWithA = define(
			{ nodeId: '0', scope: 'local', name: 'a', used: 'always', kind: 'function', definedAt: '4' },
			LocalScope,
			initializeCleanEnvironments()
		)
		const defWithAY = define(
			{ nodeId: '5', scope: 'local', name: 'y', used: 'always', kind: 'variable', definedAt: '7' },
			LocalScope,
			defWithA
		)

		assertDataflow('Late binding of y', shell, 'a <- function() { y }\ny <- 12\na()',
			emptyGraph()
				.definesVariable('0', 'a')
				.definesVariable('5', 'y', LocalScope, {environment: defWithA})
				.addVertex({
					tag:         'function-call',
					id:          '9',
					name:        'a',
					environment: defWithAY,
					args:        []
				})
				.addVertex({
					tag:        'function-definition',
					id:         '3',
					name:       '3',
					scope:      LocalScope,
					exitPoints: [ '1' ],
					subflow:    {
						out:               [],
						in:                [{ nodeId: '1', name: 'y', scope: LocalScope, used: 'always' }],
						unknownReferences: [],
						scope:             LocalScope,
						environments:      innerEnv,
						graph:             new Set(['1'])
					}})
				.addVertex({ tag: 'use', id: '1', name: 'y', scope: LocalScope, environment: innerEnv }, false)
				.definedBy('0', '3')
				.calls('9', '3')
				.reads('9', '0')
				.returns('9', '1')
				.reads('9', '5')
		)
	})

	describe('Deal with empty calls', () => {
		const withXParameter = define(
			{ nodeId: '1', scope: 'local', name: 'x', used: 'always', kind: 'parameter', definedAt: '3' },
			LocalScope,
			pushLocalEnvironment(initializeCleanEnvironments())
		)
		const withXYParameter = define(
			{ nodeId: '4', scope: 'local', name: 'y', used: 'always', kind: 'parameter', definedAt: '5' },
			LocalScope,
			withXParameter
		)
		const withADefined = define(
			{ nodeId: '0', scope: 'local', name: 'a', used: 'always', kind: 'function', definedAt: '9' },
			LocalScope,
			initializeCleanEnvironments()
		)
		assertDataflow('Not giving first parameter', shell, `a <- function(x=3,y) { y }
a(,3)`, emptyGraph()
			.addVertex({
				tag:         'function-call',
				id:          '13',
				name:        'a',
				environment: withADefined,
				args:        [
					'empty',
					{ nodeId: '12', name: `${UnnamedArgumentPrefix}12`, scope: LocalScope, used: 'always' }
				]
			})
			.definesVariable('0', 'a')
			.addVertex({
				tag:         'function-definition',
				id:          '8',
				scope:       LocalScope,
				name:        '8',
				exitPoints:  [ '6' ],
				environment: popLocalEnvironment(withXYParameter),
				subflow:     {
					out:               [],
					in:                [],
					unknownReferences: [],
					scope:             LocalScope,
					environments:      withXYParameter,
					graph:             new Set(['1', '4', '6'])
				}
			})
			.definesVariable('1', 'x', LocalScope, {environment: pushLocalEnvironment(initializeCleanEnvironments())}, false)
			.definesVariable('4', 'y', LocalScope, {environment: withXParameter}, false)
			.addVertex({ tag: 'use', id: '6', name: 'y', scope: LocalScope, environment: withXYParameter }, false)
			.reads('6', '4')

			.uses('12', `${UnnamedArgumentPrefix}12`, 'always', withADefined )
			.reads('13', '0')
			.calls('13', '8')
			.definedBy('0', '8')
			.argument('13', '12')
			.returns('13', '6')
			.definesOnCall('12', '4')
		)
	})
	describe('Reuse parameters in call', () => {
		const envWithX = define(
			{ nodeId: '3', scope: 'local', name: 'x', used: 'always', kind: EdgeType.Argument, definedAt: '3' },
			LocalScope,
			initializeCleanEnvironments()
		)
		assertDataflow('Not giving first argument', shell, 'a(x=3, x)', emptyGraph()
			.addVertex({
				tag:  'function-call',
				id:   '6',
				name: 'a',
				args: [
					['x', { nodeId: '3', name: 'x', scope: LocalScope, used: 'always' }],
					{ nodeId: '5', name: `${UnnamedArgumentPrefix}5`, scope: LocalScope, used: 'always' },
				]
			})
			.addVertex({ tag: 'use', id: '3', name: 'x', scope: LocalScope })
			.uses(
				'5',
				`${UnnamedArgumentPrefix}5`,
				'always',
				envWithX
			)
			.uses('4', 'x', 'always', envWithX)
			.argument('6', '3')
			.argument('6', '5')
			.reads('5', '4')
			.reads('4', '3')
		)
	})
	describe('Define in parameters', () => {
		assertDataflow('Support assignments in function calls', shell, 'foo(x <- 3); x', emptyGraph()
			.addVertex({
				tag:   'function-call',
				id:    '5',
				name:  'foo',
				scope: LocalScope,
				args:  [
					{ nodeId: '4', name: `${UnnamedArgumentPrefix}4`, scope: LocalScope, used: 'always' }
				]
			})
			.uses('4', `${UnnamedArgumentPrefix}4`)
			.definesVariable('1', 'x')
			.addVertex({
				tag:         'use',
				id:          '6',
				name:        'x',
				scope:       LocalScope,
				environment: define(
					{ nodeId: '1', scope: 'local', name: 'x', used: 'always', kind: 'variable', definedAt: '3' },
					LocalScope,
					initializeCleanEnvironments()
				) })
			.argument('5', '4')
			.reads('4', '1')
			.reads('6', '1')
		)
	})
}))
