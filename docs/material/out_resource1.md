# Performance Testing Service

# FAQs

## Product Documentation


**Copyright Notice**

©2013-2025 Tencent Cloud. All rights reserved.

Copyright in this document is exclusively owned by Tencent Cloud. You must not reproduce, modify, copy or

distribute in any way, in whole or in part, the contents of this document without Tencent Cloud's the prior
written consent.

**Trademark Notice**

All trademarks associated with Tencent Cloud and its services are owned by the Tencent corporate group,
including its parent, subsidiaries and affiliated companies, as the case may be. Trademarks of third parties

referred to in this document are owned by their respective proprietors.

**Service Statement**

This document is intended to provide users with general information about Tencent Cloud's products and
services only and does not form part of Tencent Cloud's terms and conditions. Tencent Cloud's products or
services are subject to change. Specific products and services and the standards applicable to them are
exclusively provided for in Tencent Cloud's applicable terms and conditions.


## FAQs

Last updated：2025-03-26 18:09:

VU (Virtual User): The number of virtual users. It is used to simulate the number of users performing
operations simultaneously in a real-world scenario, which is why it is also referred to as concurrent users.

In PTS, the value of VUs is preconfigured in the pressure configuration for the scenario.

The time taken from the moment when the client sends a request to the moment when the client fully
receives the server's response.
To measure the RT metric, the load generator collects the time taken for all requests within a specific time
window, from when the requests are sent to when responses are received. These data are then aggregated
to calculate various characteristic values, including average, maximum, minimum, and percentile values such
as the 50th, 90th, 95th, and 99th percentiles.
In PTS performance testing reports:

### Common Terms

#### VU (Concurrent User)

```
VU represents the capability of the load generator to apply pressure on the system under test.
Performance testing systems typically use a thread to represent one VU, with each VU repeatedly
executing the performance testing script. Thus, when multiple threads or VUs run concurrently, it
simulates the scenario of multiple users performing operations simultaneously in a real-world scenario.
The number of times each VU executes the script: Generally, it is determined by the performance testing
duration and iteration count, stopping when either parameter reaches its upper limit. For example, if the
performance testing duration is set to 1 hour, each VU will continuously execute the script within that
period until the time is up. (In PTS, duration configuration is supported, but iteration count configuration
is not currently available.)
Difference between VU and real users: A VU, after completing one script execution, will repeat the
execution continuously. Its focus is not on representing a specific real user but on simulating sufficient
VUs at each moment in coordination with other VUs. In other words, the load generator ensures that the
configured number of VUs is maintained at the specified times according to the pressure configuration,
thereby applying adequate pressure on the system under test.
Difference between VU and online users: Online users are not necessarily performing any operations,
whereas VUs are always executing the operations defined in the script, continuously applying pressure
on the system under test.
```
```
Concurrent mode: VUs are directly set and can be incremented over time in gradients.
RPS mode: 1 performance testing resource equals 500 VUs.
```
#### RT (Response Time)


RPS (Requests per Second) refers to the number of requests sent per second, also known as throughput. In
PTS, RPS is used in two contexts:

Detailed explanation is as follows:

```
The RT shown in the overview is calculated using the entire duration of the performance testing task as
the time window and the average value as the characteristic. It represents the average RT of all requests
throughout the testing task.
The RT in real-time curves is calculated using a small moving time window along the timeline, with the
average value as the characteristic value. It simulates the real-time average RT at each moment during
the testing task.
```
#### RPS (Requests per Second)

```
Pressure configuration > RPS mode throttling parameter, to Configure the upper limit on the number of
requests PTS can send per second;
RPS performance metric in performance testing reports, to reflect the speed at which PTS receives
responses from the server.
```
```
In most cases, RPS in the context of performance testing refers to the speed of receiving responses and
is used as a performance metric. (If "sending a request + receiving a response" is defined as a
transaction, this metric can also be referred to as TPS, or Transactions Per Second, which represents
the number of transactions completed per second.)
The load generator calculates the number of responses received per second to reflect the
processing capability of the system under test.
The number of requests completed per second, including those where the load generator, acting as
the client, successfully receives a response from the server, as well as requests that are actively
terminated.
In PTS, you can observe the RPS metric in the performance testing report to view both the overview
and real-time values of RPS:
The RPS in the overview is calculated using the entire duration of the performance testing task
as the time window, reflecting the RPS throughout the task.
The RPS in real-time curves is calculated using a small moving time window along the
timeline, simulating the RPS at each moment during the performance testing task in real time.
The value of RPS is closely related to VU and RT. For more details, see the description of their
relationship below.
In PTS, in addition to the RPS metric that reflects the processing capability of the system under test,
there is also an RPS throttling parameter that controls the number of requests sent per second by the
load generator.
In the pressure configuration of RPS mode, originate RPS, maximum RPS, and dynamic throttling
RPS are all categorized as RPS throttling parameters.
```

Constrained by factors such as the stability of the processing capability of the system under test, network
conditions, and bandwidth availability, the upper limit of the client's request-sending speed may not match
the speed at which the client receives responses from the server. Consequently, the RPS throttling
parameter configured during testing may not necessarily equal the RPS performance metric displayed in the
performance testing report.

VU = RPS x RT (in other words, Concurrent users = Throughput x Response time)
This formula is derived from Little's Law. The complete statement of Little's Law is as follows: In a system's
steady status (before reaching the tipping point of resource overload, where RT remains stable, and the
incoming RPS equals the outgoing RPS), the average number of users being served simultaneously in the
system equals the rate at which user requests enter the system multiplied by the average time each user
request spends waiting in the system.
For example, suppose the RT of a system API is 100 ms. In one second, a VU from the load generator can
send 10 requests and receive responses, indicating that the system under test has a throughput of 10
requests per second (RPS = 10). If the number of concurrent users performing operations increases by 100
times, in other words, 100 VUs are simultaneously applying load, and the API's RT remains 100ms, then each
VU can still send 10 requests and receive responses within one second. This means that the system under
test processes 1,000 requests in one second, resulting in an RPS of 1,000.
The above calculation is based on the ideal scenario where the system under test performs stably and the
RT remains unchanged. However, in reality, as VU increases and system load rises, the RT of the API under
test may not stay at 100 ms and could exhibit the following trend of increasing:

```
PTS implements the RPS throttling parameter by configuring traffic throttling during request
generation. Essentially, this parameter sets the upper limit on the number of requests sent per
second.
When you configure the RPS throttling parameter, PTS automatically adjusts the number of
performance testing resources (1 resource = 500 VUs) to ensure the load generator can send the
required number of requests per second.
```
#### Relationship Between VU, RPS, and RT


1. Initially, the system enters a linear growth phase, where RT remains relatively stable, and RPS increases
    as VU grows. During this phase, the relationship between the three metrics aligns with Little's Law: VU =
    RPS x RT.
2. As VU increases and the system's resource utilization reaches saturation, the system hits a tipping point.
Beyond this point, if VU continues to grow, RT begins to increase, and RPS starts to decrease.
3. As VU continues to increase, the system becomes overloaded and enters the oversaturation phase. In
this phase, RT increases sharply, while RPS drops significantly.

The proportion of requests in a batch that result in errors, to verify whether the response results meet
expectations. (Different systems have varying tolerance levels for error rates, but it is generally expected to
be no higher than 0.6%, meaning a success rate of at least 99.4%.)

In PTS performance testing reports:

#### Failure Rate

```
PTS calculates the request failure rate by measuring the proportion of failed response codes in a batch
of requests. Response codes greater than or equal to 400 are considered failed requests. (This includes
cases where PTS determines that the system under test is unreachable and actively cancels the request.
For related response codes, see Error Code Manual.)
The request failure rate does not include cases of checkpoint assertion failures. (For details on
checkpoints, see Checkpoint Details.)
```
```
The failure rate in the overview is calculated using the entire duration of the performance testing task as
the time window, reflecting the failure rate of all requests throughout the task.
The failure rate in real-time curves is calculated using a small moving time window along the timeline,
simulating the real-time failure rate at each moment during the performance testing task.
```
### FAQs

#### How to Troubleshoot PTS Debugging Failures or Missing Logs?


PTS provides comprehensive log troubleshooting tools, including engine logs, user logs, and request logs,
which can be divided into three main stages:
**Engine Logs** : If issues such as syntax errors or null pointer errors occur during JavaScript script writing,
causing the engine to fail in parsing the script, you can fix the errors based on the log's reported error
points.

```
Request Logs : When network I/O requests have been generated and the corresponding request packet
has been sent to the server but failed to be parsed by the server, you can use the detailed information in
the request samples or the request/response payload from the debugging feature to identify which
protocol field is causing the issue.
```

Test reports include metric data and log data, which are retained for 45 days by default. After 45 days,
expired data is automatically deleted. Before expiration, users can download the test reports for local
storage. Additionally, users can set test reports as baseline reports, which will be retained permanently.

When the system under test encounters issues, the real-time test report will show an increase in request RT,
and request failures may also occur.
To prevent service disruptions, you can configure SLA (Service Level Agreement) thresholds for the system
under test in the testing scenario orchestration. For example, you can set conditions such as RT < 100ms
and failure rate < 0.1%. When performance testing metrics exceed the SLA thresholds, alarms can be sent to
notify you, or the testing task can be automatically stopped based on the configuration.
Additionally, to avoid service disruptions, it is recommended to:

```
User Logs : Use console.log in your script to print relevant variables. You can view these logs in the user
log section to debug variable structs or return value definitions.
```
#### How Long Are Test Reports Retained in PTS?

#### How to Protect the System Under Test and Prevent It from Affecting Business

#### Availability?

```
Set a reasonable pressure model.
Set the initial load to a lower level and gradually increase the pressure using a gradient model or manual
adjustments while observing the overall service availability.
```
#### Does PTS Support Performance Testing with JMeter?


Users only need to import JMX files in the scenario orchestration to run JMeter performance tests in a
native manner. PTS supports running the JMeter engine in a distributed mode, providing easy scale-out
capabilities and real-time test reports.

The performance testing report provides detailed failure rates. Users can check the sampling logs for
specific latency distributions. If the server returns a timeout, you can customize the global option http
timeout parameter, which defaults to 10 seconds.

Two solutions are supported:

This method involves uploading the TLS certificate returned by the server to the performance testing tool
and specifying the certificate path when sending HTTP requests, thus avoiding certificate validation failures.
This approach is relatively more secure but requires manual upload of the certificate file. When using
Tencent Cloud PTS, you can upload the certificate file by following these steps:

1. Log in to Tencent Cloud Observability Platform.
2. In the left sidebar, click **PTS > Test Scenario.**
3. In the project list, click **Create New Scenario** > **Simple Mode.**

#### High HTTP Service Request Failure Rate with Numerous

#### net/http: request canceled Errors?

```
export const option =
http:
// Unit: ms
timeout: 10000
```
##### {

##### {

##### ,

##### }

##### }

#### HTTP Requests Returning x509: cannot validate certificate Errors?

```
Globally configure the parameter insecureSkipVerify: true.
```
```
export const option =
tlsConfig:
'localhost':
insecureSkipVerify: true
```
##### { { { } } }

```
Upload a dedicated TLS certificate.
```

4. In the project list page, click **File Management > Request File > Upload File**.
5. **Upload the TLS certificate** as shown in the following example:
    For instance, when using JMeter for performance testing, you can set the sslManager attribute in the
    HTTP request to specify the certificate path:


PTS supports datasets for reading test data. After the user uploads the file in the performance testing
scenario, the engine parses the CSV file and reads it using round-robin scheduling. The specific syntax is as
follows:

```
For example after uploading the root domain certificate cacrt
client certificate client crt and client key client key
export const option =
tlsConfig:
'localhost':
insecureSkipVerify: false
rootCAs: open 'ca.crt'
certificates:
```
```
cert: open 'client.crt'
key: open 'client.key'
```
```
serverName: "xxx.com"
```
##### , (. ),

##### (. ), (. )

##### {

##### {

##### {

##### ,

##### [ ( )],

##### [

##### {

##### ( ),

##### ( )

##### }

##### ],

##### }

##### }

##### }

```
Note:
Uploading certificate files requires some time for review and activation. Therefore, you may need to
wait for a period before the certificates become usable after uploading.
```
#### What Extension Methods Does PTS Support, and Where Can Parameter

#### Definitions Be Found?

```
Script Examples, including common protocols such as HTTP and WebSocket.
Overview of JavaScript API List.
Common Functions, including random number generation, Base64 encoding/decoding, and math
functions.
PTS supports full ES6 syntax and also allows third-party package reference, such as crypto.js for
capabilities not yet integrated into PTS.
```
#### How Does PTS Read Data from Test Files?

```
import dataset from 'pts/dataset';
```

VU = 0: The VU (Concurrent User) displayed in the PTS report is an instantaneous metric. When the task
ends, its instantaneous value may be 0.
Mismatch with configured load: Since most users configure a gradient load model, the VU value changes
over time following the gradient. The instantaneous value should be interpreted based on the VU curve
displayed in the chart.

Garbled characters in imported CSV files containing Chinese:
This occurs because CSV files exported by Windows use GBK encoding by default, and older versions of

```
export default function
const value = dataset get "MyKey"
//@ts-ignore Ignore validation
const postResponse = http post "http://httpbin.org/post" data:
value
console log postResponse
```
##### () {

##### . ( )

##### . ( , {

##### });

##### . ( )

##### };

```
Note:
Detailed usage guide: Using Argument Files.
```
#### Why Does the PTS Report Show VU = 0 or Mismatch with the Configured Load?

#### How to Resolve Garbled Characters in Imported CSV Files?


Excel (prior to Excel 2016) do not save the BOM (Byte Order Mark).
Solution: Export the CSV file in UTF-8 format:

If the load generator fails to receive a valid HTTP response status code from the system under test, the
status code will be set to 999 Unknown. These requests are considered failed requests and are included in
the failure rate of the performance testing report.
The error may be caused by issues with the request itself, such as incorrect protocol or address, or by
network problems, server-side DNS misconfiguration, firewall restrictions, SSL certificate errors, or timeout
disconnections, resulting in the service being unreachable.
To troubleshoot, you can see the error details in the request samples, check the error messages in the load
generator logs, or use the debug mode to analyze the requests.
Common causes:

In debug mode, the PTS performance testing engine runs for a maximum of 10 seconds before automatically
exiting.

```
On Windows, you can open the CSV file with Notepad and save it in UTF-8 format.
On Mac, use iconv -f GBK -t UTF-8 xxx.csv > utf-8.csv.
```
#### What Does Status Code 999 Indicate, and How to Troubleshoot It?

```
The load generator failed to send the request properly.
The error message in the request samples, <1>Error net/http: request canceled while waiting for
connection, may be caused by:
Network connectivity issues between the load generator and the service port of the system
under test.
Misconfigurations on the system under test, such as DNS, firewall, or SSL certificate errors.
The load generator successfully sent the request but failed to receive a valid response status code
within the timeout period.
For example, the current HTTP protocol has a default timeout of 10 seconds. You can check whether
the response time in the performance testing report exceeds 10 seconds or if the error message in
the request samples is Error net/http: request canceled. If the issue is indeed caused by
a timeout, troubleshoot the reasons for the slow response from the system under test and optimize
its request-handling capabilities.
If you need to increase the HTTP timeout, you can configure it in script mode. For more details, see
Configuration Options.
When a performance testing task ends and resources are released, any incomplete requests will be
automatically canceled by the load generator. In this case, the error message in the request samples will
```
```
show:
```
```
Error
context deadline exceeded.
```
#### Why Was Only a Portion of My Requests Executed in Debug Mode?


If the requests in your scenario cannot be completed within this 10-second limit, only a portion of the
requests will be executed.
It is recommended to run the performance testing task with a smaller number of VUs instead of using debug
mode to avoid the issue of incomplete requests within the 10-second limit.

During the performance test, the concurrent user (VUs) value displayed in the overview section of the report
page represents the real-time value. This value aligns with the blue gradient line in the chart that represents
the number of concurrent users at each moment.
At the end of a performance test, PTS possesses resources, which may cause the real-time VU value to
drop suddenly. This is an expected and normal behavior.
You can see the blue line in the chart to observe the change in concurrent users (VUs) over time. It shows
that the VUs decrease only after completing the configured gradient load as scheduled, and this drop occurs
at the end of the performance test.

PTS employs a combination of initial sampling and proportional sampling to capture user requests.

#### Why Did the VUs in the Overview Suddenly Drop at the End of the Performance

#### Test?

#### What Is the Sampling Policy for Logs, and What Is the Sampling Ratio?

```
Initial sampling policy
```

```
Requests are characterized by a combination of four dimensions: service, method, status, and result. If a
specific combination of these request characteristics has not been recorded before, such requests will be
sampled and logged.
```
User requests are sampled at a ratio of 1/1000. Requests captured by the initial sampling policy are
excluded from this ratio. Simplified, the proportional sampling works as follows: the 1st request is
sampled, the 1001st request is sampled, and so on.
Taking the performance testing of the HTTP GET request
https://mockhttpbin.pts.svc.cluster.local/get as an example:

In the PTS performance testing report, each URL is classified as a **service** by default, displaying detailed
information about all requests sent during the test. If the number of URLs is large, the console will display
details for up to 64 distinct services. Any additional services are grouped under the **tooManyService** tag.

When the number of services is too large, not classifying URLs can negatively impact the interpretation and
analysis of the report. Grouping similar requests into the same service is more beneficial for statistical
analysis. By setting the service field in the request, you can group similar requests under the same service
detail row. For configuration details, see Request.

```
Proportional sampling policy
```
```
The first request returns a status code of 200, with the request characteristics
["https://mockhttpbin.pts.svc.cluster.local/get", "get", "200", "ok"]. As this is the first occurrence of
these characteristics, the request will be sampled.
The second request returns a status of 200. As it matches the proportional sampling policy, the request
is recorded.
The 10th request encounters a 500 error, with the request characteristics
["https://mockhttpbin.pts.svc.cluster.local/get", "get", "500", "internal error"]. As the initial sampling
policy detects these as first-time characteristics, this request will also be sampled.
The 1002nd request returns a status of 200. As it matches the proportional sampling policy, this request
is also recorded.
```
#### What Does tooManyService in the Service Details of the Report Mean, and How to

#### Address It?


PTS employs synchronous performance testing, where each VU sends a request and waits for the response
before initiating the next request.
In contrast, asynchronous performance testing means that a VU sends a request and immediately proceeds
to send the next request without waiting for the response to the previous one.
Synchronous performance testing offers the following advantages:

Asynchronous performance testing has the following disadvantages:

```
// Send a http get request
import http from 'pts/http'
import check sleep from 'pts'
```
```
export default function
const resp1 = httpget "http://mockhttpbin.pts.svc.cluster.local/get"
```
```
service: "url-1"
```
```
const resp2 =
http post "http://mockhttpbin.pts.svc.cluster.local/post" ""
service: "url-2"
```
##### ;

##### { , } ;

##### () {

##### . ( ,

##### {

##### ,

##### });

##### . ( , , {

##### ,

##### });

##### }

#### Does PTS Use Synchronous or Asynchronous Performance Testing, and Why?

```
Simple and easy to understand;
Closer to real user behavior, as users typically wait for a response;
Easier to debug, as requests are executed sequentially, making it simpler to debug and analyze issues.
```
```
More complex to implement and debug;
A VU may consume excessive resources;
```

In summary, the PTS platform adopts synchronous performance testing to better simulate real user behavior.

```
Unable to accurately simulate real user behavior (especially in scenarios where users need to wait for a
response).
```

