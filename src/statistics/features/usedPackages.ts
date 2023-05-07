import { Feature, formatMap } from '../feature'
import * as xpath from 'xpath-ts'
import { MergeableRecord } from '../../util/objects'
import { EvalOptions } from 'xpath-ts/src/parse-api'
import { groupCount } from '../../util/arrays'

export type SinglePackageInfo = string

export interface PackageInfo extends MergeableRecord {
  library:              SinglePackageInfo[]
  require:              SinglePackageInfo[]
  loadNamespace:        SinglePackageInfo[]
  requireNamespace:     SinglePackageInfo[]
  attachNamespace:      SinglePackageInfo[]
  '::':                 SinglePackageInfo[]
  ':::':                SinglePackageInfo[]
  /** just contains all occurrences */
  '<loadedByVariable>': string[]
}

export const initialUsedPackageInfos = () => ({
  library:              [],
  require:              [],
  loadNamespace:        [],
  requireNamespace:     [],
  attachNamespace:      [],
  '::':                 [],
  ':::':                [],
  '<loadedByVariable>': []
})


// based on the extraction routine of lintr search for function calls which are not character-loads (we can not trace those...)
const libraryOrRequire = xpath.parse(`
  //SYMBOL_FUNCTION_CALL[text() = $variable]
    /parent::expr
    /parent::expr[
      expr[2][STR_CONST]
      or (
        expr[2][SYMBOL]
        and not(
          SYMBOL_SUB[text() = 'character.only']
          /following-sibling::expr[1]
          /NUM_CONST[text() = 'TRUE' or text() = 'T']
        )
      )
    ]/OP-LEFT-PAREN[1]/following-sibling::expr[1][SYMBOL | STR_CONST]/*
`)

// there is no except in xpath 1.0?
const packageLoadedWithVariableLoadRequire = xpath.parse(`
    //SYMBOL_FUNCTION_CALL[text() = $variable]
    /parent::expr
    /parent::expr[
        expr[2][SYMBOL]
        and (
          SYMBOL_SUB[text() = 'character.only']
          /following-sibling::expr[1]
          /NUM_CONST[text() = 'TRUE' or text() = 'T']
        )
    ]/OP-LEFT-PAREN[1]/following-sibling::expr[1][SYMBOL | STR_CONST]/*
`)

const packageLoadedWithVariableNamespaces = xpath.parse(`
  //SYMBOL_FUNCTION_CALL[text() = $variable]/../following-sibling::expr[1][SYMBOL]/*
`)

const queryForFunctionCall = xpath.parse(`
  //SYMBOL_FUNCTION_CALL[text() = $variable]/../following-sibling::expr[1][STR_CONST]/*
`)

// otherwise, the parser seems to fail
const queryForNsAccess = xpath.parse(`
  //NS_GET[text() = $variable]/../SYMBOL_PACKAGE[1]
  |
  //NS_GET_INT[text() = $variable]/../SYMBOL_PACKAGE[1]
`)

const queries: { types: readonly (keyof PackageInfo)[], query: { select(options?: EvalOptions): Node[] } }[] = [
  {
    types: [ 'library', 'require' ],
    query: libraryOrRequire
  },
  {
    types: [ 'loadNamespace', 'requireNamespace', 'attachNamespace' ],
    query: queryForFunctionCall
  },
  {
    types: [ '::', ':::' ],
    query: queryForNsAccess
  }
]

function append(existing: PackageInfo, fn: keyof PackageInfo, nodes: Node[]) {
  (existing[fn] as unknown[]).push(...new Set(nodes.map(node => node.textContent ?? '<unknown>')))
}

export const usedPackages: Feature<PackageInfo> = {
  name:        'Used Packages',
  description: 'All the packages used in the code',

  append(existing: PackageInfo, input: Document): PackageInfo {
    // we will unify in the end, so we can count, group etc. but we do not re-count multiple packages in the same file
    for(const q of queries) {
      for(const fn of q.types) {
        const nodes = q.query.select({ node: input, variables: { variable: fn } })
        append(existing, fn, nodes)
      }
    }

    for(const fn of [ 'library', 'require' ]) {
      const nodes = packageLoadedWithVariableLoadRequire.select({ node: input, variables: { variable: fn } })
      append(existing, '<loadedByVariable>', nodes)
    }
    for(const fn of [ 'loadNamespace', 'requireNamespace', 'attachNamespace' ]) {
      const nodes = packageLoadedWithVariableNamespaces.select({ node: input, variables: { variable: fn } })
      append(existing, '<loadedByVariable>', nodes)
    }

    return existing
  },

  toString(data: PackageInfo): string {
    let result = '---used packages-------------'
    result += `\n\tloaded by a variable (unknown): ${data['<loadedByVariable>'].length}`
    for(const fn of [ 'library', 'require', 'loadNamespace', 'requireNamespace', 'attachNamespace', '::', ':::' ] as (keyof PackageInfo)[]) {
      const pkgs = data[fn] as string[]
      result += `\n\t${fn} (${pkgs.length} times) ${formatMap(groupCount<SinglePackageInfo>(pkgs))}`
    }

    return result
  }
}




