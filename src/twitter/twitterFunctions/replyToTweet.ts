import { scraper } from '../twitterClient';
import { prepareMediaData } from '../utils/mediaUtils';
import { likeTweet } from './likeTweet';
import { analyzeTweetContext } from '../utils/tweetUtils';
import { findOrCreateUserFromTweet } from '../utils/profileUtils';
import { Logger } from '../../utils/logger';
import { logTweet } from '../../supabase/functions/tweetEntries';
import { logTwitterInteraction } from '../../supabase/functions/interactionEntries';

/**
 * Replies to a specific tweet and logs the interaction
 * @param replyToTweetId - The ID of the tweet to reply to
 * @param text - The text content of the reply
 * @param mediaUrls - Optional array of media URLs
 * @returns The ID of the reply tweet, or null if failed
 */
export async function replyToTweet(
  replyToTweetId: string,
  text: string,
  mediaUrls?: string[]
): Promise<string | null> {
  try {
    // Get the tweet we're replying to
    const targetTweet = await scraper.getTweet(replyToTweetId);
    if (!targetTweet || !targetTweet.username) {
      Logger.log('Failed to fetch target tweet');
      return null;
    }

    // Prepare media data for Twitter API
    const mediaData = mediaUrls ? await prepareMediaData(mediaUrls) : undefined;

    // Like the tweet before replying
    await likeTweet(replyToTweetId);

    // Send the reply using the Twitter client
    const response = await scraper.sendTweet(text, replyToTweetId, mediaData);
    const responseData = await response.json();
    const replyTweetId = responseData?.data?.create_tweet?.tweet_results?.result?.rest_id;

    if (!replyTweetId) {
      Logger.log('Failed to retrieve reply tweet ID from response:', responseData);
      return null;
    }

    // Log the bot's reply tweet
    const tweetLogResult = await logTweet({
      tweet_id: replyTweetId,
      text: text,
      tweet_type: 'reply',
      has_media: !!mediaData,
      in_reply_to_tweet_id: replyToTweetId,
      created_at: new Date().toISOString()
    }, mediaData);

    if (!tweetLogResult) {
      Logger.log('Failed to log reply tweet');
    }

    // Find or create user account
    const userAccounts = await findOrCreateUserFromTweet(targetTweet);
    if (!userAccounts) {
      Logger.log('Failed to process user account');
      return null;
    }

    // Analyze tweet context
    const context = await analyzeTweetContext(targetTweet);

    // Log the interaction
    await logTwitterInteraction({
      tweetId: replyToTweetId,
      userTweetText: targetTweet.text || '',
      userTweetTimestamp: targetTweet.timeParsed?.toISOString() || new Date().toISOString(),
      userId: userAccounts.userId || '',
      context
    });

    Logger.log(`Reply sent successfully (ID: ${replyTweetId})`);
    return replyTweetId;

  } catch (error) {
    Logger.log('Error sending reply:', error);
    return null;
  }
} 