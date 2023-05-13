import * as xml2js from "xml2js"
import { XmlParserConfig } from "../config"
import { XmlBasedJson } from "../input-format"

/**
 * parse the xml presented by R into a json object that will be used for conversion
 *
 * @param config    - the configuration to use (i.e., what names should be used for the attributes, children, ...)
 * @param xmlString - the xml input to parse
 */
export async function xlm2jsonObject(config: XmlParserConfig, xmlString: string): Promise<XmlBasedJson> {
  return await xml2js.parseStringPromise(xmlString, {
    attrkey:               config.attributeName,
    charkey:               config.contentName,
    childkey:              config.childrenName,
    charsAsChildren:       false,
    explicitChildren:      true,
    // we need this for semicolons etc., while we keep the old broken components we ignore them completely
    preserveChildrenOrder: true,
    normalize:             true,
    strict:                true
  })
}