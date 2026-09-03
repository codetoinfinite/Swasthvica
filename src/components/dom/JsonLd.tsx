/**
 * A JSON-LD block.
 *
 * Every angle bracket is replaced with its unicode escape before the string reaches
 * dangerouslySetInnerHTML. Inside a <script> element the HTML parser is in raw-text mode and stops
 * at the first "</script" in the byte stream, wherever it came from -- so a product description or
 * a company name containing that substring would close the tag early and drop the rest of the JSON
 * into the document as markup. The escape is still valid JSON and cannot terminate the element.
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
