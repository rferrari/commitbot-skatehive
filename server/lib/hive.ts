import { Client, PrivateKey } from '@hiveio/dhive';

export interface HivePostData {
  title: string;
  content: string;
  tags: string[];
  author: string;
}

export interface HivePostResult {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

export class HiveService {
  private client: Client;
  private privateKey: PrivateKey;
  private username: string;

  constructor(postingKey: string, username: string, apiUrl = 'https://api.hive.blog') {
    this.client = new Client([apiUrl]);
    this.privateKey = PrivateKey.fromString(postingKey);
    this.username = username;
  }

  async publishPost(postData: HivePostData): Promise<HivePostResult> {
    try {
      const permlink = this.generatePermlink(postData.title);
      
      const commentOp = [
        'comment',
        {
          parent_author: '',
          parent_permlink: postData.tags[0] || 'skatehive',
          author: this.username,
          permlink: permlink,
          title: postData.title,
          body: postData.content,
          json_metadata: JSON.stringify({
            tags: postData.tags,
            app: 'skatehive-devbot/1.0.0',
            format: 'markdown',
          }),
        },
      ];

      const commentOptionsOp = [
        'comment_options',
        {
          author: this.username,
          permlink: permlink,
          max_accepted_payout: '1000000.000 HBD',
          percent_hbd: 10000,
          allow_votes: true,
          allow_curation_rewards: true,
          extensions: [
            [0, {
              beneficiaries: [
                { account: 'skatehive', weight: 500 }, // 5% to skatehive
              ],
            }],
          ],
        },
      ];

      const operations = [commentOp, commentOptionsOp];
      
      const result = await this.client.broadcast.sendOperations(operations, this.privateKey);
      
      return {
        success: true,
        postId: result.id,
        url: `https://hive.blog/@${this.username}/${permlink}`,
      };
    } catch (error) {
      console.error('Error publishing to Hive:', error);
      return {
        success: false,
        error: `Failed to publish to Hive: ${error}`,
      };
    }
  }

  async getAccount(username: string): Promise<any> {
    try {
      const accounts = await this.client.database.getAccounts([username]);
      return accounts[0] || null;
    } catch (error) {
      console.error('Error fetching account:', error);
      return null;
    }
  }

  async getPost(author: string, permlink: string): Promise<any> {
    try {
      return await this.client.database.call('get_content', [author, permlink]);
    } catch (error) {
      console.error('Error fetching post:', error);
      return null;
    }
  }

  private generatePermlink(title: string): string {
    // Use a simple timestamp-based approach to avoid any character issues
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    
    // Create a very clean slug from title
    const cleanTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove everything except lowercase letters and numbers
      .substring(0, 20); // Keep it short
    
    // Create permlink with only letters, numbers, and single hyphens
    const permlink = `${cleanTitle || 'devlog'}-${timestamp}-${randomSuffix}`;
    
    // Ensure the permlink is valid (only lowercase letters, numbers, and hyphens)
    const finalPermlink = permlink
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '') // Remove any invalid characters
      .replace(/--+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    
    console.log(`Generated permlink: "${title}" -> "${finalPermlink}"`);
    
    return finalPermlink;
  }

  async validatePostingKey(): Promise<boolean> {
    try {
      const account = await this.getAccount(this.username);
      if (!account) return false;

      const publicKey = this.privateKey.createPublic();
      const postingAuthority = account.posting;
      
      return postingAuthority.key_auths.some(([key]: [string, number]) => key === publicKey.toString());
    } catch (error) {
      console.error('Error validating posting key:', error);
      return false;
    }
  }
}
