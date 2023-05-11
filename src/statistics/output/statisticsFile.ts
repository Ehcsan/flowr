import { StatisticFileProvider } from './fileProvider'


/**
 * Requires source information to be attached on parsing!
 * <p>
 * Returns the content of the node (i.e., the text content excluding the children)
 */
export function extractNodeContent(node: Node): string {
  let result = node.textContent

  if(node.hasChildNodes()) {
    const firstChild = node.childNodes.item(0)
    if(firstChild.nodeType === 3 /* text node */) {
      result = firstChild.textContent
    }
  }

  return result?.trim()?.replace('\n', '\\n') ?? '<unknown>'
}


const fileProvider = new StatisticFileProvider()

/**
 * append the content of all nodes to the storage file for the given feature
 * @param name - the name of the feature {@link Feature#name}
 * @param fn - the name of the feature-aspect to record
 * @param nodes - the nodes to append, you may pass already transformed string contents
 * @param context - the context of the information retrieval (e.g. the name of the file that contained the R source code)
 * @param unique - should duplicate entries be removed on addition
 */
export function append<T>(name: string, fn: keyof T, nodes: string[] | Node[], context: string | undefined, unique = false ) {
  if(nodes.length === 0) {
    return
  }
  let contents = typeof nodes[0] === 'string' ?
      nodes as string[]
    : (nodes as Node[]).map(extractNodeContent)

  if(unique) {
    contents = [...new Set(contents)]
  }

  // console.log(name, fn, JSON.stringify(contents))

  if(context !== undefined) {
    contents = contents.map(c => `${c}\t\t(${JSON.stringify(context)})`)
  }

  fileProvider.append(name, fn, contents.join('\n'))
}


