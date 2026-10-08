import { createTransport } from 'nodemailer';
import { firestore, functions, regionalFunctions } from './lib/utils';
import {
  EMAIL_API,
  EMAIL_API_PASSWORD,
  TARGET_EMAIL,
  isEmailConfigured
} from './lib/env';
import { SITE_URL } from './lib/constants';
import type { Tweet, User } from './types';

export const notifyEmail = regionalFunctions.firestore
  .document('tweets/{tweetId}')
  .onCreate(async (snapshot): Promise<void> => {
    if (!isEmailConfigured() || !TARGET_EMAIL.value()) {
      functions.logger.info('Email not configured; skipping notification.');
      return;
    }

    functions.logger.info('Sending notification email.');

    const { text, createdBy, images, parent } = snapshot.data() as Tweet;

    const imagesLength = images?.length ?? 0;

    const { name, username } = (
      await firestore().doc(`users/${createdBy}`).get()
    ).data() as User;

    const client = createTransport({
      service: 'Gmail',
      auth: {
        user: EMAIL_API.value(),
        pass: EMAIL_API_PASSWORD.value()
      }
    });

    const tweetLink = `${SITE_URL}/tweet/${snapshot.id}`;

    const emailHeader = `New Tweet${
      parent ? ' reply' : ''
    } from ${name} (@${username})`;

    const emailText = `${text ?? 'No text provided'}${
      images ? ` (${imagesLength} image${imagesLength > 1 ? 's' : ''})` : ''
    }\n\nLink to Tweet: ${tweetLink}\n\n- Firebase Function.`;

    await client.sendMail({
      from: EMAIL_API.value(),
      to: TARGET_EMAIL.value(),
      subject: emailHeader,
      text: emailText
    });

    functions.logger.info('Notification email sent.');
  });
