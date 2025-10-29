const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

router.use(express.json({ limit: '10mb' }));

router.post('/api/safaricom/webhook', async (req, res) => {
  try {
    const { method, data, timestamp, source } = req.body;
    
    logger.info(`Received forwarded callback from ${source}: ${method}`);
    
    res.status(200).json({ 
      status: 'received',
      timestamp: Date.now()
    });
    
    await processForwardedCallback(data, method);
    
  } catch (error) {
    logger.error('Error processing forwarded callback:', error.message);
    res.status(200).json({ 
      status: 'error',
      message: error.message 
    });
  }
});

async function processForwardedCallback(callbackData, method) {
  try {
    let msisdn = null;
    let operation = null;
    let status = null;
    
    if (method === 'POST' && callbackData.body) {
      const body = typeof callbackData.body === 'string' 
        ? JSON.parse(callbackData.body) 
        : callbackData.body;
      
      operation = body.operation;
      
      if (body.requestParam && body.requestParam.data) {
        for (const item of body.requestParam.data) {
          if (item.name === 'Msisdn') {
            msisdn = item.value;
            break;
          }
        }
      }
      
      if (body.responseParam) {
        status = body.responseParam.statusCode;
      }
    }
    
    if (method === 'GET' && callbackData.query_params) {
      msisdn = callbackData.query_params.msisdn;
      operation = callbackData.query_params.operation;
      status = callbackData.query_params.status;
    }
    
    logger.info(`Callback - MSISDN: ${msisdn}, Operation: ${operation}, Status: ${status}`);
    
    switch (operation) {
      case 'CP_NOTIFICATION':
        await handleCpNotification(callbackData, msisdn);
        break;
        
      case 'ACTIVATE':
      case 'SUBSCRIPTION':
        await handleSubscription(callbackData, msisdn, status);
        break;
        
      case 'DEACTIVATE':
      case 'UNSUBSCRIPTION':
        await handleDeactivation(callbackData, msisdn);
        break;
        
      case 'SendSMS':
        await handleSmsDelivery(callbackData, msisdn, status);
        break;
        
      default:
        await handleGenericCallback(callbackData, msisdn);
    }
    
  } catch (error) {
    logger.error('Error in processForwardedCallback:', error.message);
  }
}

async function handleCpNotification(callbackData, msisdn) {
  const body = callbackData.body;
  if (body && body.requestParam) {
    const commandData = body.requestParam.data.find(item => item.name === 'Command');
    if (commandData && commandData.value === 'PaymentSuccess') {
      logger.success(`Payment success notification for ${msisdn}`);
      await triggerMarketerPayout(msisdn);
    }
  }
}

async function handleSubscription(callbackData, msisdn, status) {
  logger.info(`Processing subscription for ${msisdn}, status: ${status}`);
}

async function handleDeactivation(callbackData, msisdn) {
  logger.info(`Processing deactivation for ${msisdn}`);
}

async function handleSmsDelivery(callbackData, msisdn, status) {
  logger.info(`Processing SMS delivery for ${msisdn}, status: ${status}`);
}

async function handleGenericCallback(callbackData, msisdn) {
  logger.info(`Processing generic callback for ${msisdn}`);
}

async function triggerMarketerPayout(msisdn) {
  try {
    logger.info(`Triggering marketer payout for ${msisdn}`);
    
  } catch (error) {
    logger.error(`Failed to trigger payout for ${msisdn}:`, error.message);
  }
}

module.exports = router;