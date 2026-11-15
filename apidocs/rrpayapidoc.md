Collection interface
Brief description
This interface is a method for merchants to request the corresponding payment address.
Request URL
{DOMAIN_URL}/payin/create
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
currencyCode Currency Code String(16) Required For detailed coding information, please refer to the Appendix - Currency Types.
payType Payment type coding String(16) Required For detailed coding information, please refer to the Appendix - Payment Types.
randomNo random numbers String(14) Required To ensure the security of data verification, randomly generated random numbers are used.
outTradeNo Order number String(20) Required Please ensure that the order number in the merchant's own system is unique.
totalAmount Order amount String(9) Required Unit: Yuan (元), only two decimal places are supported. For example, 1 Yuan = 1.00.
notifyUrl asynchronous callback address for transactions String(128) Required We have notified the merchant of the address to receive the transaction results; they must return a confirmation message (SUCCESS) to acknowledge successful receipt.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
payCardNo Payment account String(32) Required Upload using your real account. If you don't have a real account, you can temporarily upload the fixed value "123456".
payBankCode Bank Code/Payment Method String(32) Required Upload using the actual encoding. If no actual encoding is available, you can temporarily upload the fixed value "PAY".
payName Payer's Name String(32) Required Example: xiaoming (usually letters)
payEmail Mail String(32) Required Case study: xiaoming@email.com
payPhone Payer's mobile phone number String(32) Required Country code +91. Mobile phone numbers are 10 digits long, totaling 12 digits. They typically begin with 7/8/9/6. Example: +917123456789
pay Merchant payment IP String(32) Required Entering the merchant's actual payment IP address helps increase the success rate. Entering random or fixed values ​​may result in failed orders or lower the success rate.
Do not use IP addresses like 0.0.0.0 or 127.0.0.1.
payViewUrl The address to which you are redirected after payment String(128) Optional If you need to adjust to a specific page, you can upload it; otherwise, don't upload it.
Response parameter description
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000 indicates success; all others indicate failure.
stateInfo Status Description String(20) Must be passed on
merNo The platform's unique identifier, namely the merchant ID. String(15) Selected Biography Returns only when resultCode=0000
outTradeNo Order number String(32) Selected Biography Returns only when resultCode=0000
totalAmount Order amount String(32) Selected Biography The unit returned
is Yuan (RMB), and only two decimal places are supported. For example, 1 Yuan = 1.00.
payURL Payment address String(128) Selected Biography Returns only when resultCode=0000
payOrderNo Platform order number String(128) Selected Biography Returns only when resultCode=0000
payParams payment native string String(2000) Selected Biography When resultCode=0000, the result
will be returned based on the specific situation. If the bank does not support this field, it will not be returned
. Note that if this field is empty or does not exist, it will not be used for signature verification.
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Example of failure return
{
"resultCode":"9999",
"stateInfo":"Missing parameters totalAmount!"
}
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
Asynchronous callback of order collection results
Brief description
This interface is a method for the platform to proactively notify merchants of order results.

After a merchant completes a transaction, the platform will asynchronously send the payment result to the asynchronous callback address provided in the merchant's transaction request. The merchant needs to confirm that the transaction request address is accessible. Once the merchant platform successfully receives and processes the request, it must synchronously return the string "SUCCESS" to the platform. If the asynchronous callback is not received, please first confirm that the callback address is accessible. Merchants experiencing notification issues should confirm that they are returning the plain string "SUCCESS" in the correct format (without line breaks).

Request method
POST
Request parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Must be passed on Platform Identification Code
currencyCode Currency Code String(16) Must be passed on For detailed coding information, please refer to the Appendix - Currency Types.
payType Payment type coding String(16) Must be passed on For detailed coding information, please refer to the Appendix - Payment Types.
outTradeNo Order number String(20) Must be passed on Order number uploaded by the merchant system
totalAmount Order amount String(14) Must be passed on Unit: Yuan (RMB). For example, 1 Yuan = 1.00.
payOrderNo Platform order number String(16) Must be passed on
payState Payment status String(16) Must be passed on 0000: Success;
0011: Failure;
0099: Unpaid
payDate Payment time String(19) Must be passed on Time format: YYYY-MM-DD HH:mm:ss
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Response parameter format
Sample response message (responded by the merchant after receiving and verifying the parameters)
SUCCESS
Collection order query interface
Brief description
This interface provides a method for merchants to request and query order status.
(Only order information within the last three days can be queried)
Request URL
{DOMAIN_URL}/query/payOrder
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
outTradeNo Order number String(20) Required Please ensure that the order number in the merchant's own system is unique.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
Response parameter description
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000: Query operation successful;
1001: No corresponding order found;
other codes indicate query operation failure.
Note: This code only indicates the status of the query operation and does not represent the actual status of the order.
stateInfo Status Description String(20) Must be passed on
merNo The platform's unique identifier, namely the merchant ID. String(15) Selected Biography Returns only when resultCode=0000
outTradeNo Order number String(32) Selected Biography Returns only when resultCode=0000
payOrderNo Platform order number String(16) Selected Biography It only returns when resultCode=0000;
payState Order status String(16) Selected Biography Returns only when resultCode=0000;
99: Pending payment
; 00: Payment successful;
01: Payment failed;
04: Unknown error.
totalAmount Order amount String(32) Selected Biography Returns only when resultCode=0000
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
Brief description
This interface provides a method for merchants to submit payment requests.
Request URL
{DOMAIN_URL}/cashOutExc/create
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
Note

: If the request times out and no response parameters are returned, or if the returned response parameters are not in the format specified below, the order cannot be considered a failure. The final status of the order must be confirmed with customer service before processing.
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
randomNo random numbers String(14) Required To ensure the security of data verification, randomly generated random numbers are used.
currencyCode Currency Code String(16) Required For detailed coding information, please refer to the Appendix - Currency Types.
totalAmount Order amount String(9) Required (Unit: Yuan, only two decimal places are supported: For example, RMB 1 = 1.00)
outTradeNo Order number String(20) Required Please ensure that the order number in the merchant's own system is unique.
reqTimeStamp Timestamp String(13) Required Ensure data timeliness using UTC timestamps (milliseconds);
Java example: System.currentTimeMillis()
bankCode Bank Code String(20) Required 1. Bank card withdrawal:
bankCode: fixed value IMPS;
identityType: fixed value IMPS 2. UPI withdrawal:
bankCode: fixed value UPI;
identityType: fixed value UPI
bankAcctName Recipient's name (full name) String(50) Required Note: If you cannot distinguish between bankFirstName and bankLastName, then this (full name) field must be passed (the bankFirstName and bankLastName fields are not passed);
bankFirstName FirstName (the recipient) String(50) Required Note: If bankFirstName and bankLastName can be accurately distinguished, then pass the bankFirstName and bankLastName fields (do not pass the bankAcctName field).
bankLastName Payee LastName String(50) Required Note: If bankFirstName and bankLastName can be accurately distinguished, then pass the bankFirstName and bankLastName fields (do not pass the bankAcctName field).
bankAcctNo Recipient Account String(32) Required Bank card withdrawal: Bank card number;
UPI withdrawal: UPI ID
accPhone Recipient's mobile phone number String(14) Required The corresponding country code must be included. For example, if the number is 123456 and the country code is +91, then the transmitted number would be +91123456
. Note: If the [bankAcctNo] parameter is a mobile phone number, this parameter must still be entered consistently. The country code must include the + sign.
accEmail Mail String(32) Required [Brazil] Note: If the [bankAcctNo] parameter is an email address, this parameter still needs to be entered consistently.
notifyUrl asynchronous callback address for transactions String(128) Required We have notified the merchant of the address to receive the transaction results; they must return a confirmation message (SUCCESS) to acknowledge successful receipt.
identityNo ID number/tax number String(32) Required For bank card payments, you need to fill in the (IFSC)
form. For UPI payments, you need to fill in the UPI account number.
identityType Document type/payment type code String(32) Required Entering IMPS indicates bank card payment;
entering UPI indicates UPI payment.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
Response parameter description (a normal response is a JSON format string)
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000: Submission successful;
E0001: Payment rejected;
E0002: Bank network fluctuation
; E0003: Bank verification fluctuation.
Note: Other status codes besides 0000 indicate that the application has been submitted to the bank for processing. Refunds will be issued based on the final result after the processing is complete.

The following two statuses allow for direct refunds:
9999: Parameter verification error;
99: Business verification failed.
resultMsg Status Description String(20) Must be passed on
merNo The platform's unique identifier, namely the merchant ID. String(15) Selected Biography Returns only when resultCode=0000
outTradeNo Order number String(32) Selected Biography Returns only when resultCode=0000
remitOrderNo Platform order number String(32) Selected Biography Returns only when resultCode=0000
totalAmount Order amount String(32) Selected Biography Returns only when resultCode=0000
sign Encrypted string String(32) Must be passed on Uppercase letters are only returned when resultCode=0000
. See Appendix - Signature Specifications for details on the generation rules.
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
rief description
This interface is a method for the platform to proactively notify merchants of the payment results.

Please note!!! After a merchant's payment transaction is completed, the platform will asynchronously send a callback to the asynchronous callback address provided by the merchant in the transaction request. The merchant must confirm that the transaction request address is accessible. After the merchant successfully receives and processes the transaction, they must synchronously return the string "SUCCESS" to the platform. If you do not receive the asynchronous callback, please first confirm that the callback address is accessible. Merchants experiencing notification issues should confirm that they are returning the plain string "SUCCESS" in the correct format (no newline characters are needed).

Request method
POST
Request parameter format
JSON

(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Must be passed on Platform Identification Code
currencyCode Currency Code String(16) Must be passed on For detailed coding information, please refer to the Appendix - Currency Types.
outTradeNo Order number String(20) Must be passed on Order number uploaded by the merchant system
totalAmount Order amount String(14) Must be passed on Unit: Yuan (RMB). For example, 1 Yuan = 1.00.
remitOrderNo Platform order number String(20) Must be passed on Order number on the system platform
remitState Payment status String(16) Must be passed on 00: Funds successfully withdrawn.
02: Funds withdrawn but not confirmed.
11: Funds withdrawn but not confirmed (withdrawal status pending confirmation).
12: Payment rejected (funds withdrawn but not confirmed).

Refunds will be issued directly.
13: Payment cancelled (no funds deducted).
1000: Payment failed and refund issued (funds withdrawn but not confirmed; amount refunded to remaining balance).
utrCode UTR code String Selected Biography If the bank provides a response, a callback will be initiated synchronously; if the bank does not provide the response, the field will be missing or empty (if the field is missing or empty, it will not be used for signing).
remitData Payment completion time String(19) Must be passed on
orderMessage Payment details String(19) Must be passed on If the payment is successful, the system will return "success".
If the payment fails, the system will return the reason for failure provided by the bank.
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Response parameter format
Sample response message (responded by the merchant after receiving and verifying the parameters)
SUCCESS
Brief description
This interface provides a method for merchants to request and query the status of payment-on-behalf orders.
(Only order information within the last three days can be queried)
Request URL
{DOMAIN_URL}/query/remitOrder
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
outTradeNo Order number String(20) Required Please ensure that the order number in the merchant's own system is unique.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
Response parameter description
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000: Query operation successful;
1001: No corresponding order found;
other codes indicate query operation failure.
Note: This code only indicates the status of the query operation and does not represent the actual status of the order.
resultMsg Status Description String(20) Must be passed on
merNo The platform's unique identifier, namely the merchant ID. String(15) Selected Biography Returns only when resultCode=0000
outTradeNo Order number String(32) Selected Biography Returns only when resultCode=0000
remitOrderNo Platform order number String(32) Selected Biography Returns only when resultCode=0000
remitState Order status String(16) Selected Biography A return value is only returned when resultCode=0000;
00: Payment successful (fund disbursement successful)
01: Payment submitted successfully (fund disbursement in progress)
Disbursement status pending confirmation:
02: Payment failed (fund disbursement failed)
03: Payment abnormal (fund disbursement status pending confirmation)
04: Payment abnormal (fund disbursement status pending confirmation)
05: Unknown status (fund disbursement status pending confirmation)
06: Pending review (no funds deducted)
11: Disbursement unclear (fund disbursement status pending confirmation)
12: Payment rejected (fund disbursement failed)
Direct refund possible:
07: Card restricted (no funds deducted)
08: Merchant number restricted (no funds deducted)
13: Payment cancelled (no funds deducted)
1000: Payment failed, refund issued
totalAmount Order amount String(32) Selected Biography Returns only when resultCode=0000
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
Brief description
This interface provides a method for merchants to request and query their balance.
Request URL
{DOMAIN_URL}/query/balance
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
currencyCode Currency Code String(20) Required For detailed coding information, please refer to the Appendix - Currency Types.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
Response parameter description
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000 indicates success; all others indicate failure.
resultMsg Status Description String(20) Must be passed on
merNo The platform's unique identifier, namely the merchant ID. String(15) Selected Biography Returns only when resultCode=0000
currencyCode Currency Code String(32) Selected Biography Returns only when resultCode=0000
balance Available Balance String(16) Selected Biography Returns only when resultCode=0000;
retains two decimal places.
settlementAmount Amount in transit String(16) Selected Biography The result is only returned if resultCode=0000
and the merchant's settlement is not "D0";
two decimal places are retained .
freeAmount Frozen amount String(16) Selected Biography If resultCode=0000, the
system will only return a value if there is a frozen amount (i.e., the frozen amount is greater than 0);
the result will be rounded to two decimal places .
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
Brief description
This API is for merchants to request payment vouchers for orders placed on their behalf (not all currencies will have vouchers; please consult customer service).
(Only order information within the last three days can be queried)
(Returned credential address, access validity: 30 minutes)
Request URL
{DOMAIN_URL}/query/proof
Request method
POST
Request parameter format
Parameter JSON
Response parameter format
JSON
(JSON format) Explanation as follows:
Parameter name illustrate type Required Remark
merNo The platform's unique identifier, namely the merchant ID. String(15) Required Platform Identification Code
outTradeNo Order number String(20) Required Please ensure that the order number in the merchant's own system is unique.
sign Encrypted string String(32) Required It must be converted to uppercase. See the Appendix - Signature Specifications for the generation rules.
Response parameter description
Parameter name illustrate type Required Remark
resultCode status codes String(16) Must be passed on 0000: Query operation successful;
1001: No corresponding order found;
other codes indicate query operation failure.
Note: This code only indicates the status of the query operation and does not represent the actual status of the order.
resultMsg Status Description String(20) Must be passed on
outTradeNo Order number String(32) Selected Biography Returns only when resultCode=0000
remitOrderNo Platform order number String(32) Selected Biography Returns only when resultCode=0000
proofUrl Certificate address String(50) Selected Biography Returns only when resultCode=0000
queryTime Result return time String(32) Selected Biography The time format is returned only when resultCode=0000
:
YYYY-MM-DD HH:mm:ss
sign Encrypted string String(32) Must be passed on Uppercase letters; for generation rules, please refer to the Appendix - Signature Specifications.
Remark
If any submitted parameters are unclear, please contact customer service for further assistance.
