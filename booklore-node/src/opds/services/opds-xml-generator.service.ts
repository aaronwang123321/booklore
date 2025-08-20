import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpdsFeed, OpdsEntry, OpdsLink } from '../interfaces/opds.interface';

@Injectable()
export class OpdsXmlGenerator {
  constructor(private configService: ConfigService) {}

  /**
   * Generate OPDS catalog feed XML
   */
  generateCatalogFeed(feed: OpdsFeed, baseUrl: string): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>${this.escapeXml(feed.id)}</id>
  <title>${this.escapeXml(feed.title)}</title>
  <updated>${feed.updated}</updated>
  <author>
    <name>${this.escapeXml(feed.author.name)}</name>
    ${feed.author.uri ? `<uri>${this.escapeXml(feed.author.uri)}</uri>` : ''}
  </author>
  
  ${feed.links.map(link => this.generateLinkXml(link)).join('\n  ')}
  
  ${feed.entries.map(entry => this.generateEntryXml(entry, baseUrl)).join('\n  ')}
</feed>`;

    return xml;
  }

  /**
   * Generate OPDS search results XML
   */
  generateSearchFeed(
    query: string,
    entries: OpdsEntry[],
    totalResults: number,
    startIndex: number,
    itemsPerPage: number,
    baseUrl: string,
  ): string {
    const updated = new Date().toISOString();
    const feedId = `${baseUrl}/opds/search?q=${encodeURIComponent(query)}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" 
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>${this.escapeXml(feedId)}</id>
  <title>Search Results for "${this.escapeXml(query)}"</title>
  <updated>${updated}</updated>
  <author>
    <name>BookLore</name>
  </author>
  
  <link rel="start" href="${baseUrl}/opds/catalog" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="self" href="${this.escapeXml(feedId)}" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="search" href="${baseUrl}/opds/search.xml" type="application/opensearchdescription+xml"/>
  
  <opensearch:totalResults>${totalResults}</opensearch:totalResults>
  <opensearch:startIndex>${startIndex}</opensearch:startIndex>
  <opensearch:itemsPerPage>${itemsPerPage}</opensearch:itemsPerPage>
  
  ${entries.map(entry => this.generateEntryXml(entry, baseUrl)).join('\n  ')}
</feed>`;

    return xml;
  }

  /**
   * Generate OpenSearch description XML
   */
  generateOpenSearchDescription(baseUrl: string): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>BookLore</ShortName>
  <Description>Search BookLore Library</Description>
  <Tags>books ebooks library</Tags>
  <Contact>admin@booklore.app</Contact>
  <Url type="application/atom+xml;profile=opds-catalog" 
       template="${baseUrl}/opds/search?q={searchTerms}&amp;page={startPage?}&amp;limit={count?}"/>
  <LongName>BookLore Library Search</LongName>
  <Image height="64" width="64" type="image/png">${baseUrl}/favicon.png</Image>
  <Query role="example" searchTerms="science fiction"/>
  <Developer>BookLore Team</Developer>
  <Attribution>BookLore Library System</Attribution>
  <SyndicationRight>open</SyndicationRight>
  <AdultContent>false</AdultContent>
  <Language>en-us</Language>
  <OutputEncoding>UTF-8</OutputEncoding>
  <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>`;

    return xml;
  }

  /**
   * Generate entry XML
   */
  private generateEntryXml(entry: OpdsEntry, _baseUrl: string): string {
    return `<entry>
    <title>${this.escapeXml(entry.title)}</title>
    <id>${this.escapeXml(entry.id)}</id>
    <updated>${entry.updated}</updated>
    ${entry.author ? `<author><name>${this.escapeXml(entry.author)}</name></author>` : ''}
    ${entry.summary ? `<summary>${this.escapeXml(entry.summary)}</summary>` : ''}
    ${entry.content ? `<content type="text">${this.escapeXml(entry.content)}</content>` : ''}
    ${entry.links.map(link => this.generateLinkXml(link)).join('\n    ')}
  </entry>`;
  }

  /**
   * Generate link XML
   */
  private generateLinkXml(link: OpdsLink): string {
    return `<link rel="${this.escapeXml(link.rel)}" 
          href="${this.escapeXml(link.href)}" 
          type="${this.escapeXml(link.type)}"${link.title ? ` title="${this.escapeXml(link.title)}"` : ''}/>`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return '';

    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
